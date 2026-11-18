import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Light } from "@babylonjs/core/Lights/light.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { hexToLinear } from "../rock/rock-palette";

export type ChamberVector = [number, number, number];

/** The warm mining lamp: a point light with physical, inverse square falloff. */
export interface IChamberLampOptions {
    /** Position in the scene. */
    position: ChamberVector;
    /** Colour temperature in kelvin, 1000 to 12000. */
    temperature: number;
    /** Luminous intensity in candela, as Babylon.js reads it with physical falloff. */
    intensity: number;
    /** Distance beyond which the lamp lights nothing, in metres. */
    range: number;
}

/** The weak cold fill: a hemispheric light, without specular. */
export interface IChamberFillOptions {
    /** Direction of the sky colour. */
    direction: ChamberVector;
    /** Colour from that direction, sRGB `#rrggbb`. */
    color: string;
    /** Colour from the opposite direction, sRGB `#rrggbb`. */
    groundColor: string;
    intensity: number;
}

export interface IChamberLightingOptions {
    lamp: IChamberLampOptions;
    fill: IChamberFillOptions;
}

export interface IChamberLightingOverrides {
    lamp?: Partial<IChamberLampOptions>;
    fill?: Partial<IChamberFillOptions>;
}

/** Lamp of about 3000 K at the origin, 400 cd over 80 m, and a bluish fill from above at 8 %. */
export const CHAMBER_LIGHTING_DEFAULTS: Readonly<IChamberLightingOptions> = Object.freeze({
    lamp: Object.freeze({ position: [0, 0, 0] as ChamberVector, temperature: 3000, intensity: 400, range: 80 }),
    fill: Object.freeze({ direction: [0, 1, 0] as ChamberVector, color: "#9db3d6", groundColor: "#262a31", intensity: 0.08 }),
});

export interface IChamberLighting {
    readonly lamp: PointLight;
    readonly fill: HemisphericLight;
    dispose(): void;
}

/**
 * Linear RGB of a black body, normalised so that its largest component is 1. Tanner Helland's fit of the CIE 1964
 * colour matching data, 1000 K to 40000 K, converted from sRGB to linear.
 *
 * @throws Error When the temperature is outside 1000 K to 40000 K.
 */
export function kelvinToLinearRgb(kelvin: number): ChamberVector {
    if (!Number.isFinite(kelvin) || kelvin < 1000 || kelvin > 40000)
        throw new Error(`Colour temperature must be 1000 K to 40000 K, got ${kelvin}.`);
    const t = kelvin / 100;
    const red = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const srgb = [red, green, blue].map((value) => Math.min(Math.max(value, 0), 255) / 255);
    const linear = srgb.map((value) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));
    const max = Math.max(...linear);
    return [linear[0]! / max, linear[1]! / max, linear[2]! / max];
}

function checkOptions(options: IChamberLightingOptions): void {
    const issues: string[] = [];
    const finite = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
    const vector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(finite);
    const colour = (value: unknown): boolean => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
    const { lamp, fill } = options;
    if (!vector(lamp.position)) issues.push("lamp.position must be three finite numbers");
    if (!finite(lamp.temperature) || lamp.temperature < 1000 || lamp.temperature > 12000)
        issues.push("lamp.temperature must be 1000 to 12000 K");
    if (!finite(lamp.intensity) || lamp.intensity < 0) issues.push("lamp.intensity must be a number from 0");
    if (!finite(lamp.range) || lamp.range <= 0) issues.push("lamp.range must be a number greater than 0");
    if (!vector(fill.direction) || Math.hypot(...fill.direction) < 1e-6)
        issues.push("fill.direction must be three finite numbers of non-zero length");
    if (!colour(fill.color)) issues.push('fill.color must be "#rrggbb"');
    if (!colour(fill.groundColor)) issues.push('fill.groundColor must be "#rrggbb"');
    if (!finite(fill.intensity) || fill.intensity < 0) issues.push("fill.intensity must be a number from 0");
    if (issues.length > 0) throw new Error(`Invalid chamber lighting:\n- ${issues.join("\n- ")}`);
}

/** The defaults with the given fields replaced. */
export function resolveChamberLightingOptions(overrides: IChamberLightingOverrides = {}): IChamberLightingOptions {
    const options: IChamberLightingOptions = {
        lamp: { ...CHAMBER_LIGHTING_DEFAULTS.lamp, ...overrides.lamp },
        fill: { ...CHAMBER_LIGHTING_DEFAULTS.fill, ...overrides.fill },
    };
    checkOptions(options);
    return options;
}

/**
 * Lights an underground chamber: one warm mining lamp and one weak cold fill. No environment texture is needed. The
 * lamp can cast shadows through a shadow generator of the application; the fill has no specular, so the rock keeps
 * very little visible specular.
 *
 * @throws Error When an option is invalid.
 */
export function createChamberLighting(scene: Scene, overrides: IChamberLightingOverrides = {}): IChamberLighting {
    const { lamp: lampOptions, fill: fillOptions } = resolveChamberLightingOptions(overrides);
    const lamp = new PointLight("chamberLamp", new Vector3(...lampOptions.position), scene);
    lamp.diffuse = new Color3(...kelvinToLinearRgb(lampOptions.temperature));
    lamp.specular = lamp.diffuse.clone();
    lamp.falloffType = Light.FALLOFF_PHYSICAL;
    lamp.intensityMode = Light.INTENSITYMODE_LUMINOUSINTENSITY;
    lamp.intensity = lampOptions.intensity;
    lamp.range = lampOptions.range;

    const fill = new HemisphericLight("chamberFill", new Vector3(...fillOptions.direction), scene);
    fill.diffuse = new Color3(...hexToLinear(fillOptions.color));
    fill.groundColor = new Color3(...hexToLinear(fillOptions.groundColor));
    fill.specular = Color3.Black();
    fill.intensity = fillOptions.intensity;

    return {
        lamp,
        fill,
        dispose: () => {
            lamp.dispose();
            fill.dispose();
        },
    };
}
