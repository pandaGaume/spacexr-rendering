import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { ITileAddress } from "@spacexr/tiles";
import { describe, expect, it, vi } from "vitest";

import { createEarthRuntime, tileTouchesBounds, webMercatorTileBounds } from "../src";

/** A WebGL 2 context that accepts every call, so that texture arrays can be created on a null engine. */
function stubWebGL2(engine: NullEngine): void {
    const gl = new Proxy(
        {},
        {
            get: (_target, name) => (typeof name === "string" && name === name.toUpperCase() ? 0 : () => ({})),
        },
    );
    (engine as unknown as { _gl: unknown })._gl = gl;
}

async function earthWithImagery() {
    const engine = new NullEngine();
    stubWebGL2(engine);
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const camera = new FreeCamera("borrowed", new Vector3(15000000, 0, 0), scene);
    camera.setTarget(Vector3.Zero());
    camera.minZ = 1000;
    camera.maxZ = 100000000;
    const labels = {
        ownerDocument: { createElement: () => ({ style: { setProperty() {} }, remove() {} }) },
        append() {},
    } as unknown as HTMLElement;
    let version = 1;
    const load = vi.fn(async (address: ITileAddress) => {
        void address;
        return { width: 3, height: 3, channels: 4, data: new Uint8Array(36).fill(version) };
    });
    const earth = await createEarthRuntime(scene, {
        existingCamera: camera,
        labelLayer: labels,
        polarCaps: false,
        terrain: {
            engine: "gpu",
            minLOD: 1,
            maxLOD: 1,
            cells: 4,
            imagery: { tileSize: 2, maxLOD: 1, registration: "point", load },
        },
    });
    const settle = async (): Promise<void> => {
        for (let frame = 0; frame < 6; frame++) {
            await earth.update();
            scene.render(false);
            earth.afterRender();
            await earth.runtime.whenIdle();
        }
    };
    const loads = (): string[] => load.mock.calls.map(([address]) => `${address.lod}/${address.x}/${address.y}`).sort();
    return {
        earth,
        load,
        loads,
        settle,
        setVersion: (value: number) => (version = value),
        dispose: async () => {
            await earth.dispose();
            scene.dispose();
            engine.dispose();
        },
    };
}

describe("Earth imagery invalidation", () => {
    it("reloads through the imagery loader only the tiles touching the bounds, keeping their pages", async () => {
        const fixture = await earthWithImagery();
        await fixture.settle();
        const initial = fixture.loads();
        expect(initial.length).toBeGreaterThan(0);
        const terrainHandles = fixture.earth.runtime.selectedTiles.map((tile) => tile.contents[0]?.handle);

        fixture.load.mockClear();
        fixture.setVersion(2);
        // North-east quarter of the world: the level 1 tile 1/1/0 only.
        await fixture.earth.invalidateImagery({ west: 10, south: 10, east: 20, north: 20 });
        await fixture.settle();
        expect(fixture.loads()).toEqual(["1/1/0"]);
        // The terrain was not rebuilt: the same handles are still presented.
        expect(fixture.earth.runtime.selectedTiles.map((tile) => tile.contents[0]?.handle)).toEqual(terrainHandles);
        expect(fixture.earth.runtime.selectedTiles.every((tile) => tile.contents.every((content) => !content.stale))).toBe(true);

        fixture.load.mockClear();
        await fixture.earth.invalidateImagery();
        await fixture.settle();
        expect(fixture.loads()).toEqual(initial);
        await fixture.dispose();
    });
});

describe("imagery bounds", () => {
    it("measures Web Mercator tiles in degrees", () => {
        const tile = webMercatorTileBounds({ lod: 1, x: 1, y: 0 });
        expect(tile.west).toBe(0);
        expect(tile.east).toBe(180);
        expect(tile.south).toBeCloseTo(0, 12);
        expect(tile.north).toBeCloseTo(85.0511287798, 8);
    });

    it("includes the tiles sharing an edge and crosses the antimeridian", () => {
        expect(tileTouchesBounds({ lod: 1, x: 0, y: 0 }, { west: 0, south: 10, east: 10, north: 20 })).toBe(true);
        expect(tileTouchesBounds({ lod: 1, x: 0, y: 1 }, { west: 10, south: 10, east: 20, north: 20 })).toBe(false);
        const pacific = { west: 170, south: -10, east: -170, north: 10 };
        expect(tileTouchesBounds({ lod: 2, x: 0, y: 1 }, pacific)).toBe(true);
        expect(tileTouchesBounds({ lod: 2, x: 3, y: 1 }, pacific)).toBe(true);
        expect(tileTouchesBounds({ lod: 2, x: 1, y: 1 }, pacific)).toBe(false);
    });
});
