import { describe, expect, it } from "vitest";

import {
    computeRockUniforms,
    createRockSettings,
    createSeededRandom,
    hexToLinear,
    linearLuminance,
    packRockPalette,
    randomRotation,
    ROCK_PRESET_DARK_SLATE,
    ROCK_SEED_OFFSET_RANGE,
    ROCK_UNIFORM_NAMES,
    saturation,
    srgbToLinear,
} from "../src";

describe("seeded random numbers", () => {
    it("repeat for a seed and differ between seeds", () => {
        const a = createSeededRandom(12345);
        const b = createSeededRandom(12345);
        const c = createSeededRandom(12346);
        const first = Array.from({ length: 8 }, a);
        expect(Array.from({ length: 8 }, b)).toEqual(first);
        expect(Array.from({ length: 8 }, c)).not.toEqual(first);
        expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    });

    it("give proper rotations", () => {
        const random = createSeededRandom(9);
        for (let i = 0; i < 20; i++) {
            const columns = randomRotation(random);
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 3; k++) {
                    const dot = columns[j]!.reduce((sum, value, index) => sum + value * columns[k]![index]!, 0);
                    expect(dot).toBeCloseTo(j === k ? 1 : 0, 10);
                }
            }
            const [x, y, z] = columns;
            const determinant =
                x[0] * (y[1] * z[2] - y[2] * z[1]) - y[0] * (x[1] * z[2] - x[2] * z[1]) + z[0] * (x[1] * y[2] - x[2] * y[1]);
            expect(determinant).toBeCloseTo(1, 10);
        }
    });
});

describe("rock uniforms", () => {
    it("are the same for the same settings and seed", () => {
        expect(computeRockUniforms(createRockSettings({ seed: 77 }))).toEqual(computeRockUniforms(createRockSettings({ seed: 77 })));
    });

    it("change the seeded values only when the seed changes", () => {
        const a = computeRockUniforms(createRockSettings({ seed: 1 }));
        const b = computeRockUniforms(createRockSettings({ seed: 2 }));
        expect(b.rockSeed).not.toEqual(a.rockSeed);
        expect(b.rockMesoRotation0).not.toEqual(a.rockMesoRotation0);
        for (const name of ROCK_UNIFORM_NAMES.filter(
            (uniform) => uniform !== "rockSeed" && !uniform.startsWith("rockMesoRotation") && !uniform.startsWith("rockJoint"),
        )) {
            expect(b[name], name).toEqual(a[name]);
        }
    });

    it("set every uniform with four finite numbers", () => {
        const uniforms = computeRockUniforms(createRockSettings());
        expect(Object.keys(uniforms).sort()).toEqual([...ROCK_UNIFORM_NAMES].sort());
        for (const name of ROCK_UNIFORM_NAMES) {
            expect(uniforms[name]).toHaveLength(4);
            expect(uniforms[name].every(Number.isFinite), name).toBe(true);
        }
    });

    it("keep the seed offset small and the salt an exact 16-bit integer", () => {
        for (let seed = 0; seed < 50; seed++) {
            const [x, y, z, salt] = computeRockUniforms(createRockSettings({ seed: seed * 104729 })).rockSeed;
            for (const offset of [x, y, z]) expect(offset >= 0 && offset < ROCK_SEED_OFFSET_RANGE).toBe(true);
            expect(Number.isInteger(salt) && salt >= 0 && salt < 65536).toBe(true);
        }
    });

    it("normalise directions and encode quality and layer switches", () => {
        const settings = createRockSettings({
            quality: "medium",
            meso: { fractureNormal: [0, 3, 4], enabled: false },
            micro: { enabled: false },
        });
        const uniforms = computeRockUniforms(settings);
        expect(uniforms.rockFracture.slice(0, 3)).toEqual([0, 0.6, 0.8]);
        expect(Math.hypot(...uniforms.rockStrataNormal.slice(0, 3))).toBeCloseTo(1, 12);
        expect(uniforms.rockParams[1]).toBe(1);
        expect(uniforms.rockMeso[0]).toBe(0);
        expect(uniforms.rockMicro[0]).toBe(0);
        expect(uniforms.rockMacro[0]).toBe(1);
        expect(uniforms.rockDetail[0]).toBe(0);
    });
});

describe("rock palette", () => {
    it("converts sRGB to linear", () => {
        expect(srgbToLinear(0)).toBe(0);
        expect(srgbToLinear(1)).toBeCloseTo(1, 12);
        expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
        expect(hexToLinear("#ffffff")).toEqual([1, 1, 1]);
        expect(() => hexToLinear("#fff")).toThrow(/#rrggbb/);
    });

    it("pads short palettes with their last tone and keeps their count", () => {
        const packed = packRockPalette(["#000000", "#808080", "#ffffff"]);
        expect(packed.count).toBe(3);
        expect(packed.colours).toHaveLength(5);
        expect(packed.colours[3]).toEqual(packed.colours[2]);
        expect(packed.colours[4]).toEqual([1, 1, 1]);
        const uniforms = computeRockUniforms(createRockSettings({ palette: ["#000000", "#808080", "#ffffff"] }));
        expect(uniforms.rockParams[0]).toBe(3);
        expect(uniforms.rockPalette4.slice(0, 3)).toEqual([1, 1, 1]);
    });

    it("rejects palettes of the wrong size", () => {
        expect(() => packRockPalette(["#000000", "#111111"])).toThrow(/3 to 5/);
    });

    it("keeps the preset desaturated and mid-dark, for contrast with blue and orange objects", () => {
        const colours = packRockPalette(ROCK_PRESET_DARK_SLATE.palette).colours;
        for (const colour of colours) {
            // Linear luminance 0.015 to 0.12 is about sRGB 35 to 97: dark to mid-dark.
            expect(linearLuminance(colour)).toBeGreaterThan(0.015);
            expect(linearLuminance(colour)).toBeLessThan(0.12);
        }
        for (const hex of ROCK_PRESET_DARK_SLATE.palette) {
            const srgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
            // HSV saturation of the sRGB tone: the ochre, the most saturated, stays below one half.
            expect(saturation(srgb)).toBeLessThan(0.5);
        }
    });
});
