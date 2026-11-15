import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMoonRuntime, loadMoonBody, loadMoonDataset } from "../src";

// A tile service fixture: descriptors only, no tile is read.
const ELEVATION = {
    scheme: "spacexr-cube-equiangular/1",
    body: "Moon",
    frame: "MOON_ME",
    referenceRadii: [1737400, 1737400, 1737400],
    content: "elevation",
    encoding: "terrarium",
    tileSize: 256,
    minLOD: 0,
    maxLOD: 7,
    subtrees: [{ face: 5, lod: 0, x: 0, y: 0, maxLOD: 11 }],
    tiles: "./elevation/{face}/{z}/{x}/{y}.png",
};
const IMAGERY = { ...ELEVATION, content: "imagery", encoding: "webp", maxLOD: 6, subtrees: [], tiles: "./imagery/{face}/{z}/{x}/{y}.webp" };

function serve(files: Record<string, unknown>): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | string) => {
            const name = String(input).split("/").pop()!;
            return name in files ? new Response(JSON.stringify(files[name])) : new Response(null, { status: 404 });
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadMoonDataset", () => {
    it("reads the elevation and imagery descriptors, and resolves their templates against them", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": IMAGERY });
        const dataset = await loadMoonDataset("https://tiles.example.com/moon/");
        expect(dataset.radii).toEqual([1737400, 1737400, 1737400]);
        expect(dataset.elevation.deepestLOD).toBe(11);
        expect(dataset.imagery?.deepestLOD).toBe(6);
    });

    it("accepts a service without imagery", async () => {
        serve({ "elevation.json": ELEVATION });
        expect((await loadMoonDataset("https://tiles.example.com/moon")).imagery).toBeUndefined();
    });

    it("rejects descriptors of different surfaces or contents", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": { ...IMAGERY, referenceRadii: [1, 1, 1] } });
        await expect(loadMoonDataset("https://tiles.example.com/moon")).rejects.toThrow("reference surface");
        serve({ "elevation.json": { ...ELEVATION, content: "imagery" } });
        await expect(loadMoonDataset("https://tiles.example.com/moon")).rejects.toThrow("elevation");
    });
});

describe("loadMoonBody", () => {
    it("gives the body its surface, a DEM down to the deepest level and point-registered imagery", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": IMAGERY });
        const decoder = { decode: vi.fn() } as never;
        const body = await loadMoonBody("https://tiles.example.com/moon", decoder);
        expect(body.name).toBe("Moon");
        expect(body.surface.reference.radii).toEqual([1737400, 1737400, 1737400]);
        expect(body.elevation?.deepestLOD).toBe(11);
        expect(body.imagery).toMatchObject({ maxLOD: 6, registration: "point" });
    });
});

describe("createMoonRuntime", () => {
    it("requires a right-handed ECEF scene", async () => {
        serve({ "elevation.json": ELEVATION });
        const body = await loadMoonBody("https://tiles.example.com/moon", { decode: vi.fn() } as never);
        const engine = new NullEngine();
        const scene = new Scene(engine);
        await expect(createMoonRuntime(scene, { body })).rejects.toThrow("right-handed");
        scene.dispose();
        engine.dispose();
    });
});
