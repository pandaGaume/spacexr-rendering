import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMarsRuntime, loadMarsBody, loadMarsDataset } from "../src";

// A tile service fixture: descriptors only, no tile is read.
const ELEVATION = {
    scheme: "spacexr-cube-equiangular/1",
    body: "Mars",
    frame: "IAU_MARS",
    referenceRadii: [3396190, 3396190, 3376200],
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

describe("loadMarsDataset", () => {
    it("reads the elevation and imagery descriptors, and resolves their templates against them", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": IMAGERY });
        const dataset = await loadMarsDataset("https://tiles.example.com/mars/");
        expect(dataset.radii).toEqual([3396190, 3396190, 3376200]);
        expect(dataset.elevation.deepestLOD).toBe(11);
        expect(dataset.imagery?.deepestLOD).toBe(6);
    });

    it("accepts a service without imagery", async () => {
        serve({ "elevation.json": ELEVATION });
        expect((await loadMarsDataset("https://tiles.example.com/mars")).imagery).toBeUndefined();
    });

    it("rejects descriptors of different surfaces or contents", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": { ...IMAGERY, referenceRadii: [1, 1, 1] } });
        await expect(loadMarsDataset("https://tiles.example.com/mars")).rejects.toThrow("reference surface");
        serve({ "elevation.json": { ...ELEVATION, content: "imagery" } });
        await expect(loadMarsDataset("https://tiles.example.com/mars")).rejects.toThrow("elevation");
    });
});

describe("loadMarsBody", () => {
    it("gives the body its surface, a DEM down to the deepest level and point-registered imagery", async () => {
        serve({ "elevation.json": ELEVATION, "imagery.json": IMAGERY });
        const decoder = { decode: vi.fn() } as never;
        const body = await loadMarsBody("https://tiles.example.com/mars", decoder);
        expect(body.name).toBe("Mars");
        expect(body.surface.reference.radii).toEqual([3396190, 3396190, 3376200]);
        expect(body.elevation?.deepestLOD).toBe(11);
        expect(body.imagery).toMatchObject({ maxLOD: 6, registration: "point" });
    });
});

describe("createMarsRuntime", () => {
    it("requires a right-handed ECEF scene", async () => {
        serve({ "elevation.json": ELEVATION });
        const body = await loadMarsBody("https://tiles.example.com/mars", { decode: vi.fn() } as never);
        const engine = new NullEngine();
        const scene = new Scene(engine);
        await expect(createMarsRuntime(scene, { body })).rejects.toThrow("right-handed");
        scene.dispose();
        engine.dispose();
    });
});
