import { packRockPalette } from "./rock-palette";
import { createSeededRandom, randomRotation } from "./rock-random";
import type { IRockSettings, RockQuality, RockVector } from "./rock-settings";

/**
 * Every uniform of the rock, in declaration order. Each is a vec4:
 *
 * | Uniform               | x                    | y                   | z                     | w                    |
 * | --------------------- | -------------------- | ------------------- | --------------------- | -------------------- |
 * | `rockPalette0..4`     | red, linear          | green               | blue                  | 1                    |
 * | `rockParams`          | palette count        | quality, 0 to 2     | normal strength       | occlusion strength   |
 * | `rockSeed`            | offset x, metres     | offset y            | offset z              | hash salt, integer   |
 * | `rockSurface`         | roughness            | roughness variation | grain roughness       | distant roughness    |
 * | `rockMacro`           | weight, 0 or 1       | scale               | tone contrast         | strata contrast      |
 * | `rockStrata`          | thickness            | warp                | warp scale            | relief               |
 * | `rockStrataNormal`    | unit normal x        | y                   | z                     | transition           |
 * | `rockFracture`        | unit normal x        | y                   | z                     | anisotropy           |
 * | `rockJointB`, `C`     | unit normal x        | y                   | z                     | spacing              |
 * | `rockMeso`            | weight, 0 or 1       | cell size           | secondary cell size   | secondary weight     |
 * | `rockFacet`           | slope                | tone variation      | bend amplitude        | bend scale           |
 * | `rockCrack`           | width                | depth               | cavity darkening      | fracture variation |
 * | `rockMesoRotation0..2`| rotation column x    | y                   | z                     | 0                    |
 * | `rockMicro`           | weight, 0 or 1       | scale               | relief                | fine crack depth     |
 * | `rockDetail`          | weight, 0 or 1       | tile size           | strength              | 0                    |
 */
export const ROCK_UNIFORM_NAMES = [
    "rockPalette0",
    "rockPalette1",
    "rockPalette2",
    "rockPalette3",
    "rockPalette4",
    "rockParams",
    "rockSeed",
    "rockSurface",
    "rockMacro",
    "rockStrata",
    "rockStrataNormal",
    "rockFracture",
    "rockJointB",
    "rockJointC",
    "rockMeso",
    "rockFacet",
    "rockCrack",
    "rockMesoRotation0",
    "rockMesoRotation1",
    "rockMesoRotation2",
    "rockMicro",
    "rockDetail",
] as const;

export type RockUniformName = (typeof ROCK_UNIFORM_NAMES)[number];

export type Vec4 = [number, number, number, number];

export type RockUniforms = Record<RockUniformName, Vec4>;

/** The quality level of the shader: the number of optional layers it evaluates. */
export const ROCK_QUALITY_LEVELS: Readonly<Record<RockQuality, number>> = { low: 0, medium: 1, high: 2 };

/** Seed offsets stay below this many metres: the rock position keeps the precision of 32-bit floats. */
export const ROCK_SEED_OFFSET_RANGE = 256;

function unit(vector: RockVector): RockVector {
    const length = Math.hypot(...vector);
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}

const cross = (a: RockVector, b: RockVector): RockVector => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

const add = (a: RockVector, b: RockVector, scale: number): RockVector => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];

/**
 * Normals of the two minor joint sets: roughly perpendicular to the dominant one and to each other, each leaning by up
 * to about 20 degrees, in a direction set by the seed.
 */
export function minorJoints(dominant: RockVector, random: () => number): [RockVector, RockVector] {
    let axis: RockVector = [0, 0, 0];
    while (Math.hypot(...cross(dominant, axis)) < 0.2) axis = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
    const b = unit(add(unit(cross(dominant, axis)), dominant, 0.7 * (random() - 0.5)));
    const c = unit(add(unit(cross(dominant, b)), dominant, 0.7 * (random() - 0.5)));
    return [b, c];
}

const flag = (enabled: boolean): number => (enabled ? 1 : 0);

/**
 * The uniform values of valid settings. Pure and deterministic: the seed drives a SplitMix32 sequence that gives the
 * offset of the rock space, the salt of every hash, and the rotation of the second meso octave.
 */
export function computeRockUniforms(settings: IRockSettings): RockUniforms {
    const random = createSeededRandom(settings.seed);
    const offset: RockVector = [random() * ROCK_SEED_OFFSET_RANGE, random() * ROCK_SEED_OFFSET_RANGE, random() * ROCK_SEED_OFFSET_RANGE];
    // 16 bits: exact as a float, and shifted by the shader per layer.
    const salt = Math.floor(random() * 65536);
    const rotation = randomRotation(random);
    const palette = packRockPalette(settings.palette);
    const [c0, c1, c2, c3, c4] = palette.colours as [RockVector, RockVector, RockVector, RockVector, RockVector];
    const { surface, macro, meso, micro, detail } = settings;
    const strataNormal = unit(macro.strataNormal);
    const fractureNormal = unit(meso.fractureNormal);
    const [jointB, jointC] = minorJoints(fractureNormal, random);
    return {
        rockPalette0: [...c0, 1],
        rockPalette1: [...c1, 1],
        rockPalette2: [...c2, 1],
        rockPalette3: [...c3, 1],
        rockPalette4: [...c4, 1],
        rockParams: [palette.count, ROCK_QUALITY_LEVELS[settings.quality], surface.normalStrength, surface.occlusionStrength],
        rockSeed: [...offset, salt],
        rockSurface: [surface.roughness, surface.roughnessVariation, surface.grainRoughness, surface.distantRoughness],
        rockMacro: [flag(macro.enabled), macro.scale, macro.toneContrast, macro.strataContrast],
        rockStrata: [macro.strataThickness, macro.strataWarp, macro.strataWarpScale, macro.strataRelief],
        rockStrataNormal: [...strataNormal, macro.strataTransition],
        rockFracture: [...fractureNormal, meso.anisotropy],
        rockJointB: [...jointB, meso.cellSize],
        rockJointC: [...jointC, 1.35 * meso.cellSize],
        rockMeso: [flag(meso.enabled), meso.cellSize, meso.secondaryCellSize, meso.secondaryWeight],
        rockFacet: [meso.facetSlope, meso.toneVariation, meso.bendAmplitude, meso.bendScale],
        rockCrack: [meso.crackWidth, meso.crackDepth, meso.cavityDarkening, meso.fractureVariation],
        rockMesoRotation0: [...rotation[0], 0],
        rockMesoRotation1: [...rotation[1], 0],
        rockMesoRotation2: [...rotation[2], 0],
        rockMicro: [flag(micro.enabled), micro.scale, micro.relief, micro.fineCrackDepth],
        rockDetail: [flag(detail.enabled), detail.scale, detail.strength, 0],
    };
}
