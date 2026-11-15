import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { SolarSystemBodies } from "@spacexr/celestial-core/catalog";
import { TileRuntime, VerticalScale } from "@spacexr/3d-tiles-runtime";
import { createEarthRuntime, EARTH_SYSTEM, earthSunDirection } from "../src";

describe("Earth composition", () => {
    it("uses the Celestial shape of the Earth", () => {
        expect(EARTH_SYSTEM.ellipsoid).toBe(SolarSystemBodies.Earth!.ellipsoid);
    });
    it("converts Celestial observer directions into ECEF and rejects invalid dates", () => {
        const noon = earthSunDirection(new Date("2026-03-20T12:00:00Z"));
        const midnight = earthSunDirection(new Date("2026-03-20T00:00:00Z"));
        expect(noon[0]).toBeGreaterThan(0.99);
        expect(midnight[0]).toBeLessThan(-0.99);
        expect(Math.hypot(...noon)).toBeCloseTo(1, 12);
        expect(() => earthSunDirection(new Date(NaN))).toThrow();
    });
    it("drives the actual TileRuntime and preserves borrowed scene and camera on disposal", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const camera = new FreeCamera("borrowed", new Vector3(15000000, 0, 0), scene);
        camera.setTarget(Vector3.Zero());
        const labels = {
            ownerDocument: {
                createElement: () => ({
                    style: { setProperty() {} },
                    remove() {},
                }),
            },
            append() {},
        } as unknown as HTMLElement;
        const earth = await createEarthRuntime(scene, {
            existingCamera: camera,
            labelLayer: labels,
            terrain: { engine: "mesh", minLOD: 1, maxLOD: 1, cells: 4 },
        });
        expect(earth.runtime).toBeInstanceOf(TileRuntime);
        for (let i = 0; i < 8; i++) await earth.update();
        await earth.dispose();
        await earth.dispose();
        expect(scene.isDisposed).toBe(false);
        expect(scene.cameras).toContain(camera);
        expect(scene.meshes).toHaveLength(0);
        expect(scene.lights).toHaveLength(0);
        await expect(earth.update()).rejects.toThrow("disposed");
        scene.dispose();
        engine.dispose();
    });
    it("shares a vertical scale, keeps a fixed Sun and finishes the frame of its engine", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const camera = new FreeCamera("borrowed", new Vector3(15000000, 0, 0), scene);
        camera.setTarget(Vector3.Zero());
        const labels = {
            ownerDocument: { createElement: () => ({ style: { setProperty() {} }, remove() {} }) },
            append() {},
        } as unknown as HTMLElement;
        const verticalScale = new VerticalScale(2);
        const earth = await createEarthRuntime(scene, {
            existingCamera: camera,
            labelLayer: labels,
            verticalScale,
            sunDirection: [1, 0, 0],
            terrain: { engine: "mesh", minLOD: 1, maxLOD: 1, cells: 4 },
        });
        expect(earth.verticalScale).toBe(verticalScale);
        const sun = scene.lights.find((light) => light instanceof DirectionalLight) as DirectionalLight;
        expect(sun.direction.x).toBeCloseTo(-1, 12);
        await earth.setDate(new Date("2026-03-20T00:00:00Z"));
        expect(sun.direction.x).toBeCloseTo(-1, 12);
        await earth.update();
        earth.afterRender();
        await earth.dispose();
        scene.dispose();
        engine.dispose();
    });

    it("rejects normal pages on the mesh engine", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const camera = new FreeCamera("borrowed", new Vector3(15000000, 0, 0), scene);
        await expect(
            createEarthRuntime(scene, {
                existingCamera: camera,
                labelLayer: {} as HTMLElement,
                terrain: { engine: "mesh", normals: { load: async () => undefined, maxLOD: 1, registration: "area", tileSize: 256 } },
            }),
        ).rejects.toThrow("GPU");
        scene.dispose();
        engine.dispose();
    });
});
