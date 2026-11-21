import { ResidentTiles, tileAddressKey, type ITileAddress } from "@spacexr/tiles";
import { describe, expect, it, vi } from "vitest";

import type { BabylonRasterPages } from "../src/raster/raster-pages";
import { GpuTerrainNormals } from "../src/terrain/gpu/gpu-terrain-normals";
import { instancedGridPixelShader } from "../src/terrain/gpu/shaders/instancedGrid.fragment";
import { instancedGridVertexShader } from "../src/terrain/gpu/shaders/instancedGrid.vertex";
import { shaderBranch } from "./shader-branch";

function fixture() {
    const pending: { address: ITileAddress; signal: AbortSignal; resolve: () => void }[] = [];
    const resident = new ResidentTiles<number>();
    const pages = {
        resident,
        pyramid: {
            areaOf(address: ITileAddress) {
                const lod = Math.min(15, address.lod),
                    scale = 2 ** (address.lod - lod);
                return { ancestor: { lod, x: Math.floor(address.x / scale), y: Math.floor(address.y / scale) } };
            },
            retain: vi.fn(),
            release: vi.fn(),
        },
        release: vi.fn((address: ITileAddress) => resident.delete(address)),
        load: vi.fn(
            (address: ITileAddress, signal: AbortSignal) =>
                new Promise((resolve, reject) => {
                    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
                    pending.push({
                        address,
                        signal,
                        resolve: () => {
                            resident.set(address, pending.indexOf(pending.find((p) => p.address === address)!));
                            resolve({ address, layer: resident.get(address) });
                        },
                    });
                }),
        ),
    };
    return { pages: pages as unknown as BabylonRasterPages, state: pages, pending };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("provider normal data preparation", () => {
    it("coalesces geometric descendants into their physical normal tile", async () => {
        const { pages, state, pending } = fixture(),
            normals = new GpuTerrainNormals(pages);
        normals.sync(Array.from({ length: 64 }, (_, i) => ({ lod: 18, x: 800 + (i % 8), y: 1600 + Math.floor(i / 8) })));
        expect(state.load).toHaveBeenCalledTimes(1);
        expect(pending[0]!.address).toEqual({ lod: 15, x: 100, y: 200 });
        expect(normals.layer({ lod: 18, x: 807, y: 1607 })).toBeUndefined();
        pending[0]!.resolve();
        await settle();
        expect(normals.layer({ lod: 18, x: 807, y: 1607 })).toBe(0);
        normals.dispose();
        expect(state.pyramid.retain).toHaveBeenCalledTimes(1);
        expect(state.pyramid.release).toHaveBeenCalledTimes(1);
    });

    it("bounds concurrent requests and cancels pending work on disposal", async () => {
        const { pages, state, pending } = fixture(),
            normals = new GpuTerrainNormals(pages);
        normals.sync(Array.from({ length: 20 }, (_, x) => ({ lod: 15, x, y: 1 })));
        expect(state.load).toHaveBeenCalledTimes(4);
        normals.dispose();
        await settle();
        expect(pending.every((p) => p.signal.aborted)).toBe(true);
        expect(state.load).toHaveBeenCalledTimes(4);
        expect(state.pyramid.release).toHaveBeenCalledTimes(4);
    });

    it("drops queued hidden sources and aborts only loads which left the displayed cut", async () => {
        const { pages, state, pending } = fixture(),
            normals = new GpuTerrainNormals(pages, 1);
        const a = { lod: 15, x: 1, y: 1 },
            b = { lod: 15, x: 2, y: 1 },
            c = { lod: 15, x: 3, y: 1 };
        normals.sync([a, b, c]);
        expect(state.load).toHaveBeenCalledTimes(1);
        normals.sync([c]);
        expect(pending[0]!.signal.aborted).toBe(true);
        await settle();
        expect(state.load).toHaveBeenCalledTimes(2);
        expect(pending[1]!.address).toEqual(c);
        pending[1]!.resolve();
        await settle();
        expect(state.load).not.toHaveBeenCalledWith(b, expect.anything());
        expect(normals.layer(c)).toBe(1);
        normals.dispose();
    });

    it("evicts an unused page instead of a visible source when its cache fills", async () => {
        const { pages, state, pending } = fixture(),
            normals = new GpuTerrainNormals(pages, 1, 2);
        const a = { lod: 15, x: 1, y: 1 },
            b = { lod: 15, x: 2, y: 1 },
            c = { lod: 15, x: 3, y: 1 };
        normals.sync([a, b]);
        pending[0]!.resolve();
        await settle();
        pending[1]!.resolve();
        await settle();
        normals.sync([b, c]);
        expect(state.release).toHaveBeenCalledWith(a);
        expect(state.release).not.toHaveBeenCalledWith(b);
        expect(pending[2]!.address).toEqual(c);
        pending[2]!.resolve();
        await settle();
        expect([...state.resident.addresses()].map(tileAddressKey).sort()).toEqual([b, c].map(tileAddressKey).sort());
        normals.dispose();
    });

    it("retries a failing source less and less often, reports it once, and starts over once it loaded", async () => {
        let now = 0;
        const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        let failing = true;
        const resident = new ResidentTiles<number>();
        const load = vi.fn(async (address: ITileAddress) => {
            if (failing) throw new Error("bad tile");
            resident.set(address, resident.get(address) ?? 0);
            return { address, layer: 0 };
        });
        const pages = {
            resident,
            pyramid: { areaOf: (address: ITileAddress) => ({ ancestor: address }), retain: vi.fn(), release: vi.fn() },
            release: vi.fn((address: ITileAddress) => resident.delete(address)),
            load,
        } as unknown as BabylonRasterPages;
        const normals = new GpuTerrainNormals(pages, 1, 1);
        const a = { lod: 15, x: 1, y: 1 },
            b = { lod: 15, x: 2, y: 1 };
        const at = async (time: number): Promise<void> => {
            now = time;
            normals.update();
            for (let i = 0; i < 10; i++) await Promise.resolve();
        };
        try {
            normals.sync([a]);
            await at(0);
            expect(load).toHaveBeenCalledTimes(1);
            // 5 s, then 10 s, then 20 s after each failure.
            for (const [before, next, calls] of [
                [4999, 5000, 2],
                [14999, 15000, 3],
                [34999, 35000, 4],
            ] as const) {
                await at(before);
                expect(load).toHaveBeenCalledTimes(calls - 1);
                await at(next);
                expect(load).toHaveBeenCalledTimes(calls);
            }
            expect(warn).toHaveBeenCalledTimes(1);
            // It loads after 40 s: the failures are forgotten.
            failing = false;
            await at(75000);
            expect(load).toHaveBeenCalledTimes(5);
            expect(normals.layer(a)).toBe(0);
            // Evicted by another source, then failing again: back to 5 s, and reported again.
            normals.sync([b]);
            await at(75000);
            failing = true;
            normals.sync([a]);
            await at(75000);
            expect(warn).toHaveBeenCalledTimes(2);
            const calls = load.mock.calls.length;
            await at(79999);
            expect(load).toHaveBeenCalledTimes(calls);
            await at(80000);
            expect(load).toHaveBeenCalledTimes(calls + 1);
        } finally {
            normals.dispose();
            clock.mockRestore();
            warn.mockRestore();
        }
    });
});

describe("provider normal shader path", () => {
    it("uses provider east/north/up with exact RGB128 decoding and keeps the missing-page fallback", () => {
        const fragment = shaderBranch(instancedGridPixelShader.shader, ["RUNTIME_SELECTION", "PROVIDER_NORMALS", "IMAGERY"]);
        expect(fragment).toContain("* (255.0 / 128.0) - 1.0");
        expect(fragment).toContain("tangent.xy *= verticalScale;");
        expect(fragment).toContain("normalize(vEast) * tangent.x - normalize(vSouth) * tangent.y + normalize(vUp) * tangent.z");
        expect(fragment).toContain("if (!providerNormal(normal)) {");
        expect(fragment).toContain("joinedGradient(vTile)");
        expect(fragment).toContain("texelFetch(imageryTables");
        const plain = shaderBranch(instancedGridPixelShader.shader, ["RADIAL_HEIGHTS", "IMAGERY"]);
        expect(plain).not.toContain("providerNormal");
        expect(plain).not.toContain("normalTextures");
    });

    it("omits normal work in optional ambient mode while preserving DEM displacement", () => {
        const defines = ["RUNTIME_SELECTION", "IMAGERY", "PROVIDER_NORMALS", "AMBIENT_ONLY"];
        const vertex = shaderBranch(instancedGridVertexShader.shader, defines);
        const fragment = shaderBranch(instancedGridPixelShader.shader, defines);
        expect(vertex).toContain("vec3 local = surface + localUp * heightIn(elevationAt(h), position.xy);");
        expect(fragment).toContain("gl_FragColor = vec4(albedo, 1.0);");
        for (const token of ["heightGradient", "sampleGradient", "providerNormal", "normalTextures", "vUp", "vNormalPage"]) {
            expect(fragment).not.toContain(token);
            expect(vertex).not.toContain(token);
        }
    });
});
