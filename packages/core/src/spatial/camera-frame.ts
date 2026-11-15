import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Frustum } from "@babylonjs/core/Maths/math.frustum.js";
import type { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import type { IEcefCameraFrame, IPlane } from "@spacexr/3d-tiles-runtime";

function planeToRuntimePlane(plane: Plane): IPlane {
    return { x: plane.normal.x, y: plane.normal.y, z: plane.normal.z, w: plane.d };
}

/** Options of {@link createEcefCameraFrame}. */
export interface IEcefCameraFrameOptions {
    /**
     * Periphery of the view, where tiles stay active without being visible, as a fraction of the half extent of the view
     * at the distance of the target the camera orbits. Tiles are selected for a camera that has already moved when they
     * are drawn, so without a periphery the edges of the image lack terrain while the camera turns. Defaults to 0: no
     * periphery.
     */
    frustumMargin?: number;
}

/** View and projection of a camera, the projection widened by a margin. */
function cullingTransform(camera: Camera, margin: number): Matrix {
    const projection = Array.from(camera.getProjectionMatrix().m);
    projection[0]! /= 1 + margin;
    projection[5]! /= 1 + margin;
    return camera.getViewMatrix().multiply(Matrix.FromArray(projection));
}

/** Distance to the target an orbiting camera turns around, such as the `radius` of a Babylon `GeospatialCamera`. */
function targetDistance(camera: Camera): number | undefined {
    const radius = (camera as { radius?: unknown }).radius;
    return typeof radius === "number" && Number.isFinite(radius) && radius > 0 ? radius : undefined;
}

/**
 * Planes of the periphery: every plane of the view, the near plane included, moved outward by the same distance, the
 * margin times the half extent of the view at the target. The margin is then the same at every depth: the ground close
 * to the camera, where the finest tiles enter the image while it turns, has its periphery too. Widening the projection
 * alone keeps the apex on the camera and gives no margin there; it remains for a camera without a target.
 */
function peripheryPlanes(camera: Camera, margin: number): IPlane[] {
    const distance = targetDistance(camera);
    if (distance === undefined) return Frustum.GetPlanes(cullingTransform(camera, margin)).map(planeToRuntimePlane);
    const projection = camera.getProjectionMatrix().m;
    // Half extents of the view at the target are distance / projection[0] across and distance / projection[5] up.
    const offset = (margin * distance) / Math.min(projection[0]!, projection[5]!);
    // Babylon normalises the planes of a frustum: adding to `d` moves a plane along its normal, outward.
    return Frustum.GetPlanes(camera.getTransformationMatrix()).map((plane) => ({ ...planeToRuntimePlane(plane), w: plane.d + offset }));
}

/**
 * Captures a Babylon camera as the renderer-neutral ECEF camera frame. The scene must use ECEF world coordinates,
 * which `useLargeWorldRendering` keeps precise on the GPU.
 */
export function createEcefCameraFrame(camera: Camera, engine: AbstractEngine, options: IEcefCameraFrameOptions = {}): IEcefCameraFrame {
    const margin = options.frustumMargin ?? 0;
    const frustumPlanes = Frustum.GetPlanes(camera.getTransformationMatrix()).map(planeToRuntimePlane);
    // The near plane faces the view: its unit normal is the direction of the view, whatever the handedness of the scene.
    const near = frustumPlanes[0]!;
    return {
        id: camera.id,
        position: {
            x: camera.globalPosition.x,
            y: camera.globalPosition.y,
            z: camera.globalPosition.z,
        },
        viewportHeight: engine.getRenderHeight() * camera.viewport.height,
        verticalFovRadians: camera.fov,
        forward: { x: near.x, y: near.y, z: near.z },
        frustumPlanes,
        ...(margin > 0 ? { peripheryFrustumPlanes: peripheryPlanes(camera, margin) } : {}),
        timestamp: performance.now(),
    };
}
