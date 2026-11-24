import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { OrbitalCamera } from "@spacexr/3d-tiles-babylon";
import { planetocentricDirection, type ICartesian3 } from "@spacexr/tiles";

import type { IPlace } from "./panels";

type Vector = { x: number; y: number; z: number };

const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector, b: Vector): Vector => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});
const normalized = (a: Vector): Vector => {
    const length = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / length, y: a.y / length, z: a.z / length };
};
/** Smooth start and stop of a phase, from 0 to 1. */
const ease = (t: number): number => t * t * (3 - 2 * t);
/** Angle in `(-pi, pi]`. */
const wrapped = (radians: number): number =>
    Math.atan2(Math.sin(radians), Math.cos(radians));

/** Lights of a body example, which `createMoonRuntime` and `createMarsRuntime` place for the point the camera starts on. */
export interface IFlightLights {
    sun?: DirectionalLight | undefined;
    sky?: HemisphericLight | undefined;
}

/** Options of {@link CameraFlight}. */
export interface ICameraFlightOptions {
    /** Lights moved with the orbited point, so the side the flight reaches stays lit as the start was. */
    lights?: IFlightLights;
    /** Seconds of a flight across a quarter of the body at speed 1, zooms excluded. Defaults to 4. */
    quarterSeconds?: number;
}

/**
 * Flight of an {@link OrbitalCamera} to a place, in three phases: it climbs to a distance that shows the start and the
 * place together, levels the view; travels along the great circle of the orbited point; then descends to the view of
 * the place, its pitch and heading. A speed of 2 halves every phase. A pointer, wheel or key input stops it where it is.
 *
 * The sun of the example is set for the place the page starts on, from its north-west at 45 degrees. The flight keeps
 * that sun over the orbited point, so the place it reaches is lit the same way.
 */
export class CameraFlight {
    private observer: Observer<Scene> | undefined;
    private readonly stopInputs: () => void;
    private finish: (() => void) | undefined;

    public constructor(
        private readonly scene: Scene,
        private readonly camera: OrbitalCamera,
        private readonly options: ICameraFlightOptions = {},
    ) {
        const element = scene.getEngine().getInputElement();
        const stop = (): void => this.cancel();
        element?.addEventListener("pointerdown", stop);
        element?.addEventListener("wheel", stop, { passive: true });
        element?.addEventListener("keydown", stop);
        this.stopInputs = () => {
            element?.removeEventListener("pointerdown", stop);
            element?.removeEventListener("wheel", stop);
            element?.removeEventListener("keydown", stop);
        };
    }

    /** Whether a flight is running. */
    public get flying(): boolean {
        return this.observer !== undefined;
    }

    /**
     * Flies to a place. Resolves when the camera arrives, or when the flight is cancelled or replaced.
     *
     * @param speed - Multiplier of the speed, positive. 1 crosses a quarter of the body in about `quarterSeconds`.
     */
    public flyTo(place: IPlace, speed = 1): Promise<void> {
        this.cancel();
        const { frame } = this.camera;
        const rate = speed > 0 && Number.isFinite(speed) ? speed : 1;
        const target = planetocentricDirection(place.latitude, place.longitude);
        const start = { ...frame.direction };
        const angle = Math.acos(Math.min(1, Math.max(-1, dot(start, target))));
        const bodyRadius = frame.surface.radius(frame.direction);
        const startRadius = frame.radius;
        const endRadius = Math.min(
            Math.max(place.radius, frame.radiusMin),
            frame.radiusMax,
        );
        // High enough to see the start and the place together; never lower than either view.
        const orbitRadius = Math.min(
            frame.radiusMax * 0.9,
            Math.max(startRadius, endRadius, 1.2 * angle * bodyRadius),
        );
        const startPitch = frame.pitch;
        const endPitch = (place.pitch * Math.PI) / 180;
        const quarter = this.options.quarterSeconds ?? 4;
        // Zooms take time per factor of distance, the travel per angle: both scale with the speed.
        const climb = (0.5 + 0.35 * Math.log(orbitRadius / startRadius)) / rate;
        const travel =
            angle > 1e-6 ? (quarter * angle) / (Math.PI / 2) / rate : 0;
        const descend = (0.5 + 0.35 * Math.log(orbitRadius / endRadius)) / rate;
        let elapsed = 0;
        let headingTurned = 0;
        let headingTurn: number | undefined;

        return new Promise<void>((resolve) => {
            this.finish = resolve;
            this.observer = this.scene.onBeforeRenderObservable.add(() => {
                elapsed += this.scene.getEngine().getDeltaTime() / 1000;
                if (elapsed < climb) {
                    const t = ease(elapsed / climb);
                    frame.radius =
                        startRadius * Math.pow(orbitRadius / startRadius, t);
                    frame.pitch = startPitch * (1 - t);
                } else if (elapsed < climb + travel) {
                    frame.radius = orbitRadius;
                    frame.pitch = 0;
                    this.moveToward(
                        target,
                        angle * (1 - ease((elapsed - climb) / travel)),
                    );
                } else {
                    this.moveToward(target, 0);
                    const t = Math.min(1, (elapsed - climb - travel) / descend);
                    const eased = ease(t);
                    frame.radius =
                        orbitRadius * Math.pow(endRadius / orbitRadius, eased);
                    frame.pitch = endPitch * eased;
                    const heading = frame.headingRadians;
                    if (headingTurn === undefined && heading !== undefined)
                        headingTurn = wrapped(
                            ((place.yaw ?? 0) * Math.PI) / 180 - heading,
                        );
                    if (headingTurn !== undefined) {
                        frame.rotateHeading(
                            headingTurn * eased - headingTurned,
                        );
                        headingTurned = headingTurn * eased;
                    }
                    if (t >= 1) {
                        this.placeLights();
                        this.camera.poseChanged();
                        this.end();
                        return;
                    }
                }
                this.placeLights();
                this.camera.poseChanged();
            });
        });
    }

    /** Stops the flight where it is. */
    public cancel(): void {
        this.end();
    }

    public dispose(): void {
        this.end();
        this.stopInputs();
    }

    private end(): void {
        if (this.observer)
            this.scene.onBeforeRenderObservable.remove(this.observer);
        this.observer = undefined;
        const finish = this.finish;
        this.finish = undefined;
        finish?.();
    }

    /** Moves the orbited point along its great circle until `remaining` radians separate it from `target`. */
    private moveToward(target: ICartesian3, remaining: number): void {
        const { frame } = this.camera;
        const direction = frame.direction;
        const current = Math.acos(
            Math.min(1, Math.max(-1, dot(direction, target))),
        );
        const step = current - remaining;
        if (step <= 0) return;
        const tangent = normalized({
            x: target.x - direction.x * dot(direction, target),
            y: target.y - direction.y * dot(direction, target),
            z: target.z - direction.z * dot(direction, target),
        });
        frame.pan(
            step * dot(tangent, frame.right),
            step * dot(tangent, frame.forward),
        );
    }

    /** The sun from the north-west at 45 degrees over the orbited point, and the sky over it. */
    private placeLights(): void {
        const { sun, sky } = this.options.lights ?? {};
        if (!sun && !sky) return;
        const up = this.camera.frame.up;
        let north: Vector = {
            x: -up.z * up.x,
            y: -up.z * up.y,
            z: 1 - up.z * up.z,
        };
        north =
            Math.hypot(north.x, north.y, north.z) > 1e-9
                ? normalized(north)
                : { x: 1, y: 0, z: 0 };
        const east = cross(north, up);
        const toSun = normalized({
            x: up.x + (north.x - east.x) * Math.SQRT1_2,
            y: up.y + (north.y - east.y) * Math.SQRT1_2,
            z: up.z + (north.z - east.z) * Math.SQRT1_2,
        });
        sun?.direction.set(-toSun.x, -toSun.y, -toSun.z);
        sky?.direction.set(up.x, up.y, up.z);
    }
}
