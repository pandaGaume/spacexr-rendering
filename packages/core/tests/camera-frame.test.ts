import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { describe, expect, it } from "vitest";

import { createEcefCameraFrame } from "../src/spatial/camera-frame";

const FOV = Math.PI / 3;

function frame(frustumMargin?: number, radius?: number) {
    const view = Matrix.LookAtLH(Vector3.Zero(), new Vector3(0, 0, 1), Vector3.Up());
    const projection = Matrix.PerspectiveFovLH(FOV, 1, 1, 10000);
    const camera = {
        id: "camera",
        globalPosition: Vector3.Zero(),
        viewport: { height: 1 },
        fov: FOV,
        ...(radius === undefined ? {} : { radius }),
        getViewMatrix: () => view,
        getProjectionMatrix: () => projection,
        getTransformationMatrix: () => view.multiply(projection),
    } as unknown as Camera;
    const engine = { getRenderHeight: () => 1000 } as unknown as AbstractEngine;
    return createEcefCameraFrame(camera, engine, frustumMargin === undefined ? {} : { frustumMargin });
}

/** Whether a point lies inside every plane of a frame. */
function inside(planes: ReturnType<typeof frame>["frustumPlanes"], x: number, z: number): boolean {
    return planes!.every((plane) => plane.x * x + plane.z * z + plane.w >= 0);
}

describe("createEcefCameraFrame", () => {
    // Half the view at a distance of 1000, along the horizontal axis.
    const half = 1000 * Math.tan(FOV / 2);

    it("keeps the frustum of the view, with or without a margin", () => {
        const planes = frame().frustumPlanes;
        expect(inside(planes, 0.99 * half, 1000)).toBe(true);
        expect(inside(planes, 1.01 * half, 1000)).toBe(false);
        expect(frame(0).frustumPlanes).toEqual(planes);
        expect(frame(0.25).frustumPlanes).toEqual(planes);
    });

    it("places the periphery at the margin, on both sides", () => {
        const planes = frame(0.25).peripheryFrustumPlanes;
        expect(inside(planes, 1.2 * half, 1000)).toBe(true);
        expect(inside(planes, -1.2 * half, 1000)).toBe(true);
        expect(inside(planes, 1.3 * half, 1000)).toBe(false);
    });

    it("gives the periphery the same margin at every depth for a camera orbiting a target", () => {
        // The camera orbits a target 1000 away: the margin is a quarter of the half view there, everywhere.
        const margin = 0.25 * half;
        const planes = frame(0.25, 1000).peripheryFrustumPlanes;
        const visible = frame(0.25, 1000).frustumPlanes;
        // At the target, as before.
        expect(inside(planes, half + (0.9 * margin) / Math.cos(FOV / 2), 1000)).toBe(true);
        expect(inside(planes, half + (1.1 * margin) / Math.cos(FOV / 2), 1000)).toBe(false);
        // Close to the camera, beside the view and behind the near plane: the ground the camera turns onto.
        const near = 20 * Math.tan(FOV / 2);
        expect(inside(visible, near + 0.5 * margin, 20)).toBe(false);
        expect(inside(planes, near + 0.5 * margin, 20)).toBe(true);
        expect(inside(planes, 0, -0.5 * margin)).toBe(true);
        expect(inside(planes, 0, -1.1 * margin)).toBe(false);
        // A projection widened alone has no margin there.
        expect(inside(frame(0.25).peripheryFrustumPlanes, near + 0.5 * margin, 20)).toBe(false);
    });

    it("gives the unit direction of the view", () => {
        const forward = frame().forward!;
        expect(forward.x).toBeCloseTo(0, 12);
        expect(forward.y).toBeCloseTo(0, 12);
        expect(forward.z).toBeCloseTo(1, 12);
    });

    it("has no periphery without a margin", () => {
        expect(frame().peripheryFrustumPlanes).toBeUndefined();
        expect(frame(0).peripheryFrustumPlanes).toBeUndefined();
    });
});
