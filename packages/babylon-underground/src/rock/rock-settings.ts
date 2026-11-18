/**
 * Settings of the procedural rock: a plain JSON object. The same settings, seed included, always give the same rock.
 *
 * Lengths are in metres of the mesh-local space. Directions are three numbers, normalised by the material. Colours are
 * sRGB hexadecimal strings, `#rrggbb`.
 */

/** Cost of the rock: `low` keeps the macro layer and the first meso octave, `medium` adds the second meso octave, `high` the micro layer. */
export type RockQuality = "low" | "medium" | "high";

export type RockVector = [number, number, number];

/** Surface response of the rock. */
export interface IRockSurfaceSettings {
    /** Mean roughness, 0.8 to 0.95 for a matte rock. */
    roughness: number;
    /** Roughness change by macro tone and by meso cell, plus or minus. */
    roughnessVariation: number;
    /** Roughness change by the micro grain, plus or minus: the mineral nuances. */
    grainRoughness: number;
    /** Roughness added where the micro relief is too fine for the pixels, so distant walls do not sparkle. */
    distantRoughness: number;
    /** Dielectric reflectance at normal incidence, as a factor of the usual 4 %: below 1 for very little specular. */
    specular: number;
    /** Multiplies every relief of the rock in the normal. */
    normalStrength: number;
    /** Ambient occlusion of the cracks, 0 to 1. */
    occlusionStrength: number;
}

/** A, macro (decametric): tone variation and strata. */
export interface IRockMacroSettings {
    enabled: boolean;
    /** Wavelength of the tone variation. */
    scale: number;
    /** Share of the palette the tone variation spans, 0 to 1. */
    toneContrast: number;
    /** Normal of the bedding planes. */
    strataNormal: RockVector;
    /** Thickness of a bed. */
    strataThickness: number;
    /** How far the beds are bent, in metres. */
    strataWarp: number;
    /** Wavelength of the bending. */
    strataWarpScale: number;
    /** Tone difference between beds, 0 to 1. */
    strataContrast: number;
    /** Height of the step between two beds. */
    strataRelief: number;
    /** Width of the step, as a fraction of a bed. */
    strataTransition: number;
}

/**
 * B, meso (metric): angular blocks and fractures. Three joint sets of parallel planes cut large blocks: the dominant set
 * along `fractureNormal`, `cellSize / anisotropy` apart, and two minor sets roughly across it, `cellSize` and
 * `1.35 x cellSize` apart, oriented by the seed. Voronoi fragments of `secondaryCellSize` break the blocks further.
 */
export interface IRockMesoSettings {
    enabled: boolean;
    /** Normal of the dominant joint set. */
    fractureNormal: RockVector;
    /** How much the dominant joints dominate: their spacing is `cellSize / anisotropy`, and fragments are that much thinner across them. */
    anisotropy: number;
    /** Low frequency variation of how fractured the rock is: open cracks and facet slopes fade in calmer regions, 0 to 1. */
    fractureVariation: number;
    /** Size of the large blocks: the spacing of the first minor joint set. */
    cellSize: number;
    /** Size of the small fragments. */
    secondaryCellSize: number;
    /** Strength of the small fragments relative to the large blocks, 0 to 1. */
    secondaryWeight: number;
    /** Slope of the flat facet of each block or fragment, a tangent. */
    facetSlope: number;
    /** Tone difference between large blocks, 0 to 1. */
    toneVariation: number;
    /** How far the joint planes are bent, in metres. */
    bendAmplitude: number;
    /** Wavelength of the bending. */
    bendScale: number;
    /** Width of a crack. */
    crackWidth: number;
    /** Depth of a crack. */
    crackDepth: number;
    /** Albedo darkening at the bottom of a crack, 0 to 0.35. */
    cavityDarkening: number;
}

/** C, micro (centimetric): grain and fine cracks, by normal and roughness only. */
export interface IRockMicroSettings {
    enabled: boolean;
    /** Wavelength of the coarsest grain octave; three finer octaves follow. */
    scale: number;
    /** Height of the coarsest grain octave. */
    relief: number;
    /** Depth of the fine cracks. */
    fineCrackDepth: number;
}

/** Optional tiling detail normal map, sampled triplanar in rock space. No texture is shipped. */
export interface IRockDetailSettings {
    enabled: boolean;
    /** Size of one tile of the texture. */
    scale: number;
    /** Strength of its slopes. */
    strength: number;
}

export interface IRockSettings {
    /** Unsigned 32-bit integer. */
    seed: number;
    /** Three to five sRGB tones, ordered: the macro tone runs from the first to the last. */
    palette: string[];
    quality: RockQuality;
    surface: IRockSurfaceSettings;
    macro: IRockMacroSettings;
    meso: IRockMesoSettings;
    micro: IRockMicroSettings;
    detail: IRockDetailSettings;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Settings in which any field may be left out: it then comes from the preset. */
export type IRockSettingsOverrides = DeepPartial<IRockSettings>;

/**
 * The one preset: dark slate grey with rock brown and a discreet ochre, matte, desaturated and mid-dark, so blue and
 * orange objects keep their contrast. Beds dip gently, the dominant fractures are steep. Purely decorative.
 */
export const ROCK_PRESET_DARK_SLATE: Readonly<IRockSettings> = deepFreeze({
    seed: 1,
    palette: ["#282b30", "#373b41", "#44423f", "#4f4c48", "#5d5143"],
    quality: "high",
    surface: {
        roughness: 0.88,
        roughnessVariation: 0.06,
        grainRoughness: 0.05,
        distantRoughness: 0.04,
        specular: 0.5,
        normalStrength: 1,
        occlusionStrength: 0.4,
    },
    macro: {
        enabled: true,
        scale: 30,
        toneContrast: 0.55,
        strataNormal: [0.22, 0.95, 0.2],
        strataThickness: 3.5,
        strataWarp: 1,
        strataWarpScale: 22,
        strataContrast: 0.15,
        strataRelief: 0.04,
        strataTransition: 0.06,
    },
    meso: {
        enabled: true,
        fractureNormal: [0.85, 0.15, 0.5],
        anisotropy: 1.8,
        fractureVariation: 0.6,
        cellSize: 4,
        secondaryCellSize: 0.9,
        secondaryWeight: 0.35,
        facetSlope: 0.3,
        toneVariation: 0.06,
        bendAmplitude: 0.5,
        bendScale: 12,
        crackWidth: 0.04,
        crackDepth: 0.03,
        cavityDarkening: 0.15,
    },
    micro: {
        enabled: true,
        scale: 0.16,
        relief: 0.007,
        fineCrackDepth: 0.002,
    },
    detail: {
        enabled: false,
        scale: 0.5,
        strength: 0.3,
    },
} satisfies IRockSettings);

function deepFreeze<T>(value: T): T {
    if (typeof value === "object" && value !== null) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

/** Thrown with every problem of invalid settings. */
export class RockSettingsError extends Error {
    public readonly issues: readonly string[];

    public constructor(issues: readonly string[]) {
        super(`Invalid rock settings:\n- ${issues.join("\n- ")}`);
        this.name = "RockSettingsError";
        this.issues = issues;
    }
}

const QUALITIES: readonly RockQuality[] = ["low", "medium", "high"];
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function merge(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        const current = result[key];
        result[key] = isRecord(current) && isRecord(value) ? merge(current, value) : clone(value);
    }
    return result;
}

/**
 * The preset with the given fields replaced, validated. A palette or a vector is replaced whole.
 *
 * @throws RockSettingsError When the result is invalid.
 */
export function createRockSettings(overrides: IRockSettingsOverrides = {}): IRockSettings {
    return validateRockSettings(
        merge(clone(ROCK_PRESET_DARK_SLATE) as unknown as Record<string, unknown>, overrides as Record<string, unknown>),
    );
}

class Checker {
    public readonly issues: string[] = [];

    public constructor(private readonly root: Record<string, unknown>) {}

    public section(path: string): Record<string, unknown> {
        const value = this.root[path];
        if (isRecord(value)) return value;
        this.issues.push(`${path} must be an object, got ${describe(value)}`);
        return {};
    }

    public number(object: Record<string, unknown>, path: string, min: number, max: number, exclusiveMin = false): void {
        const value = object[last(path)];
        const ok = typeof value === "number" && Number.isFinite(value) && (exclusiveMin ? value > min : value >= min) && value <= max;
        if (!ok)
            this.issues.push(
                `${path} must be a number ${exclusiveMin ? "greater than" : "from"} ${min}${max === Infinity ? "" : ` to ${max}`}, got ${describe(value)}`,
            );
    }

    public boolean(object: Record<string, unknown>, path: string): void {
        if (typeof object[last(path)] !== "boolean") this.issues.push(`${path} must be true or false, got ${describe(object[last(path)])}`);
    }

    public direction(object: Record<string, unknown>, path: string): void {
        const value = object[last(path)];
        const ok =
            Array.isArray(value) &&
            value.length === 3 &&
            value.every((component) => typeof component === "number" && Number.isFinite(component)) &&
            Math.hypot(...(value as number[])) > 1e-6;
        if (!ok) this.issues.push(`${path} must be three finite numbers of non-zero length, got ${describe(value)}`);
    }
}

function last(path: string): string {
    return path.slice(path.lastIndexOf(".") + 1);
}

function describe(value: unknown): string {
    if (value === undefined) return "nothing";
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * Checks settings read from JSON, and returns them typed. Unknown fields are reported: a misspelt setting never falls
 * back silently on a default.
 *
 * @throws RockSettingsError With every problem found.
 */
export function validateRockSettings(value: unknown): IRockSettings {
    if (!isRecord(value)) throw new RockSettingsError([`settings must be an object, got ${describe(value)}`]);
    const check = new Checker(value);
    const known: Record<string, readonly string[]> = {
        "": Object.keys(ROCK_PRESET_DARK_SLATE),
        surface: Object.keys(ROCK_PRESET_DARK_SLATE.surface),
        macro: Object.keys(ROCK_PRESET_DARK_SLATE.macro),
        meso: Object.keys(ROCK_PRESET_DARK_SLATE.meso),
        micro: Object.keys(ROCK_PRESET_DARK_SLATE.micro),
        detail: Object.keys(ROCK_PRESET_DARK_SLATE.detail),
    };
    for (const key of Object.keys(value)) if (!known[""]?.includes(key)) check.issues.push(`${key} is not a rock setting`);

    const seed = value["seed"];
    if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        check.issues.push(`seed must be an integer from 0 to 4294967295, got ${describe(seed)}`);
    }
    const palette = value["palette"];
    if (!Array.isArray(palette) || palette.length < 3 || palette.length > 5) {
        check.issues.push(`palette must hold 3 to 5 colours, got ${describe(palette)}`);
    } else {
        palette.forEach((colour, index) => {
            if (typeof colour !== "string" || !HEX_COLOUR.test(colour))
                check.issues.push(`palette[${index}] must be "#rrggbb", got ${describe(colour)}`);
        });
    }
    if (!QUALITIES.includes(value["quality"] as RockQuality))
        check.issues.push(`quality must be "low", "medium" or "high", got ${describe(value["quality"])}`);

    const sections = ["surface", "macro", "meso", "micro", "detail"] as const;
    const parts = Object.fromEntries(sections.map((name) => [name, check.section(name)])) as Record<
        (typeof sections)[number],
        Record<string, unknown>
    >;
    for (const name of sections) {
        for (const key of Object.keys(parts[name]))
            if (!known[name]?.includes(key)) check.issues.push(`${name}.${key} is not a rock setting`);
    }

    const { surface, macro, meso, micro, detail } = parts;
    check.number(surface, "surface.roughness", 0.3, 1);
    check.number(surface, "surface.roughnessVariation", 0, 0.3);
    check.number(surface, "surface.grainRoughness", 0, 0.3);
    check.number(surface, "surface.distantRoughness", 0, 0.3);
    check.number(surface, "surface.specular", 0, 1);
    check.number(surface, "surface.normalStrength", 0, 4);
    check.number(surface, "surface.occlusionStrength", 0, 1);

    check.boolean(macro, "macro.enabled");
    check.number(macro, "macro.scale", 1, 1000);
    check.number(macro, "macro.toneContrast", 0, 1);
    check.direction(macro, "macro.strataNormal");
    check.number(macro, "macro.strataThickness", 0.05, 100);
    check.number(macro, "macro.strataWarp", 0, 100);
    check.number(macro, "macro.strataWarpScale", 0.5, 1000);
    check.number(macro, "macro.strataContrast", 0, 1);
    check.number(macro, "macro.strataRelief", 0, 1);
    check.number(macro, "macro.strataTransition", 0.005, 0.5);

    check.boolean(meso, "meso.enabled");
    check.direction(meso, "meso.fractureNormal");
    check.number(meso, "meso.anisotropy", 1, 6);
    check.number(meso, "meso.fractureVariation", 0, 1);
    check.number(meso, "meso.cellSize", 0.1, 100);
    check.number(meso, "meso.secondaryCellSize", 0.05, 100);
    check.number(meso, "meso.secondaryWeight", 0, 1);
    check.number(meso, "meso.facetSlope", 0, 2);
    check.number(meso, "meso.toneVariation", 0, 1);
    check.number(meso, "meso.bendAmplitude", 0, 100);
    check.number(meso, "meso.bendScale", 0.5, 1000);
    check.number(meso, "meso.crackWidth", 0, 1, true);
    check.number(meso, "meso.crackDepth", 0, 1);
    check.number(meso, "meso.cavityDarkening", 0, 0.35);
    const cellSize = meso["cellSize"];
    const secondaryCellSize = meso["secondaryCellSize"];
    if (typeof cellSize === "number" && typeof secondaryCellSize === "number" && cellSize >= 0.1 && secondaryCellSize >= cellSize) {
        check.issues.push(`meso.secondaryCellSize must be smaller than meso.cellSize, got ${secondaryCellSize} and ${cellSize}`);
    }

    check.boolean(micro, "micro.enabled");
    check.number(micro, "micro.scale", 0.005, 2);
    check.number(micro, "micro.relief", 0, 0.1);
    check.number(micro, "micro.fineCrackDepth", 0, 0.05);

    check.boolean(detail, "detail.enabled");
    check.number(detail, "detail.scale", 0, 100, true);
    check.number(detail, "detail.strength", 0, 2);

    if (check.issues.length > 0) throw new RockSettingsError(check.issues);
    return clone(value) as unknown as IRockSettings;
}
