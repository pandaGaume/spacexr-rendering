import { Observable } from "@babylonjs/core/Misc/observable.js";
import { GeodeticSystem as FixtureGeodeticSystem } from "@spacexr/geodesy";
import { webMercatorTiling as FixtureTiling } from "@spacexr/terrain-tileset";
import type { ITileAddress } from "@spacexr/tiles";
import { describe, expect, it, vi } from "vitest";

import { BabylonRasterPages } from "../src/raster/raster-pages";
import { BabylonRasterTileAdapter } from "../src/raster/raster-tile-adapter";
import { GpuTerrainEngine } from "../src/terrain/gpu/gpu-terrain-engine";
import { createNullScene } from "./helpers";

vi.mock("../src/raster/texture-array-pool", () => ({
    TextureArrayPool: class {
        public readonly onGrowObservable = new Observable();
        public readonly layersKeptOnGrowth = true;
        public readonly writes: Array<{ layer: number; first: number }> = [];
        public readonly gpuBytes = 0;
        private used = 0;
        private free: number[] = [];
        public reserve() {
            return this.free.pop() ?? this.used++;
        }
        public release(layer: number) {
            this.free.push(layer);
        }
        public write(layer: number, data: ArrayLike<number>) {
            this.writes.push({ layer, first: data[0]! });
        }
        public dispose() {
            this.onGrowObservable.clear();
        }
    },
}));

const TILE = { lod: 1, x: 0, y: 0 };
const OTHER = { lod: 1, x: 1, y: 1 };

/** Pages over a point-registered source whose texels all hold the current `version`. */
function fixture() {
    const state = { version: 1, gate: undefined as Promise<void> | undefined };
    const load = vi.fn(async (_address: ITileAddress) => {
        const version = state.version;
        if (state.gate) await state.gate;
        return { width: 3, height: 3, channels: 4, data: new Uint8Array(36).fill(version) };
    });
    const pages = new BabylonRasterPages(createNullScene(), { tileSize: 2, maxLOD: 1, registration: "point", load });
    const writes = (pages.pool as unknown as { writes: Array<{ layer: number; first: number }> }).writes;
    return { pages, load, state, writes };
}

const loadsOf = (load: ReturnType<typeof fixture>["load"], address: ITileAddress): number =>
    load.mock.calls.filter(([called]) => called.lod === address.lod && called.x === address.x && called.y === address.y).length;

describe("imagery page invalidation", () => {
    it("reloads a stale page into the same layer and leaves the other pages as they are", async () => {
        const { pages, load, state, writes } = fixture();
        const page = (await pages.load(TILE))!;
        await pages.load(OTHER);
        state.version = 2;

        expect(pages.invalidate((address) => address.x === 0)).toEqual([TILE]);
        expect(pages.isStale(TILE)).toBe(true);
        expect(pages.isStale(OTHER)).toBe(false);
        // Still resident, and displayed, while it waits for its reload.
        expect(pages.resident.get(TILE)).toBe(page.layer);

        const reloaded = await pages.load(TILE);
        expect(reloaded).toEqual(page);
        expect(pages.isStale(TILE)).toBe(false);
        expect(loadsOf(load, TILE)).toBe(2);
        expect(writes.filter(({ layer }) => layer === page.layer).at(-1)?.first).toBe(2);

        await pages.load(OTHER);
        expect(loadsOf(load, OTHER)).toBe(1);
    });

    it("loads again a raster that was loading when the source changed", async () => {
        const { pages, load, state, writes } = fixture();
        let open!: () => void;
        state.gate = new Promise<void>((resolve) => (open = resolve));
        const loading = pages.load(TILE);
        await Promise.resolve();
        state.version = 2;
        state.gate = undefined;
        pages.invalidate();
        open();
        const page = (await loading)!;
        expect(loadsOf(load, TILE)).toBe(2);
        expect(writes.filter(({ layer }) => layer === page.layer).map(({ first }) => first)).toEqual([2]);
    });

    it("refreshes the page of an imagery runtime tile in place, keeping its handle", async () => {
        const { pages, load } = fixture();
        const adapter = new BabylonRasterTileAdapter<unknown>(pages, { addressOf: () => TILE });
        const handle = (await pages.load(TILE))!;
        pages.invalidate();
        const ready = vi.fn(async () => true);
        await adapter.activate({
            refresh: true,
            pendingContents: [{ id: "content", uri: "imagery://0", handle }],
            signal: new AbortController().signal,
            readiness: { ready, failed: vi.fn(), cancelled: vi.fn() },
        } as unknown as Parameters<BabylonRasterTileAdapter<unknown>["activate"]>[0]);
        expect(loadsOf(load, TILE)).toBe(2);
        expect(ready).toHaveBeenCalledWith("content", expect.objectContaining({ kind: "renderable", handle }));
        expect(pages.resident.get(TILE)).toBe(handle.layer);
    });

    it("keeps the GPU terrain handle of a refreshed tile", async () => {
        const engine = new GpuTerrainEngine(
            {
                tiling: FixtureTiling(FixtureGeodeticSystem.WGS84),
                scene: createNullScene(),
                labelLayer: {} as HTMLElement,
                wireframe: false,
                junctions: "fine",
                edgeHeights: "coarsest",
                geometrySelection: "runtime",
            },
            { cells: 8 },
        );
        const handle = { identity: TILE, presented: true };
        const ready = vi.fn(async () => true);
        await engine.activate({
            refresh: true,
            pendingContents: [{ id: "content", handle }],
            signal: new AbortController().signal,
            readiness: { ready, failed: vi.fn(), cancelled: vi.fn() },
        } as unknown as Parameters<GpuTerrainEngine["activate"]>[0]);
        expect(ready).toHaveBeenCalledWith("content", { kind: "renderable", handle });
        expect(engine.getStatistics().created).toBe(0);
        engine.dispose();
    });
});
