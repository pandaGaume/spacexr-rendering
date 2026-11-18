import { describe, expect, it } from "vitest";

import { createRockSettings, ROCK_PRESET_DARK_SLATE, RockSettingsError, validateRockSettings } from "../src";
import type { IRockSettings } from "../src";

function issuesOf(value: unknown): readonly string[] {
    try {
        validateRockSettings(value);
    } catch (error) {
        if (error instanceof RockSettingsError) return error.issues;
        throw error;
    }
    return [];
}

describe("rock settings", () => {
    it("take the documented preset by default", () => {
        expect(createRockSettings()).toEqual(ROCK_PRESET_DARK_SLATE);
        expect(validateRockSettings(JSON.parse(JSON.stringify(ROCK_PRESET_DARK_SLATE)))).toEqual(ROCK_PRESET_DARK_SLATE);
    });

    it("follow the material constraints of the brief in the preset", () => {
        const preset = ROCK_PRESET_DARK_SLATE;
        expect(preset.surface.roughness).toBeGreaterThanOrEqual(0.8);
        expect(preset.surface.roughness).toBeLessThanOrEqual(0.95);
        expect(preset.surface.specular).toBeLessThan(1);
        expect(preset.palette.length).toBeGreaterThanOrEqual(3);
        expect(preset.palette.length).toBeLessThanOrEqual(5);
        expect(preset.meso.secondaryCellSize).toBeLessThan(preset.meso.cellSize);
        expect(preset.detail.enabled).toBe(false);
    });

    it("keep the preset immutable", () => {
        expect(Object.isFrozen(ROCK_PRESET_DARK_SLATE.meso)).toBe(true);
        expect(Object.isFrozen(ROCK_PRESET_DARK_SLATE.palette)).toBe(true);
        const settings = createRockSettings();
        settings.meso.cellSize = 10;
        expect(ROCK_PRESET_DARK_SLATE.meso.cellSize).toBe(4);
    });

    it("merge overrides field by field, and replace palettes and vectors whole", () => {
        const settings = createRockSettings({
            seed: 42,
            meso: { cellSize: 6, fractureNormal: [0, 0, 1] },
            palette: ["#101010", "#202020", "#303030"],
        });
        expect(settings.seed).toBe(42);
        expect(settings.meso.cellSize).toBe(6);
        expect(settings.meso.secondaryCellSize).toBe(ROCK_PRESET_DARK_SLATE.meso.secondaryCellSize);
        expect(settings.meso.fractureNormal).toEqual([0, 0, 1]);
        expect(settings.palette).toEqual(["#101010", "#202020", "#303030"]);
    });

    it("survive a JSON round trip unchanged", () => {
        const settings = createRockSettings({ seed: 7, quality: "medium" });
        expect(validateRockSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    });

    it("report every problem at once, with its path", () => {
        const broken = JSON.parse(JSON.stringify(ROCK_PRESET_DARK_SLATE)) as Record<string, Record<string, unknown>>;
        broken["meso"]!["cellSize"] = -1;
        broken["surface"]!["roughness"] = "rough";
        broken["macro"]!["strataNormal"] = [0, 0, 0];
        const issues = issuesOf(broken);
        expect(issues).toHaveLength(3);
        expect(issues.join("\n")).toMatch(/meso\.cellSize must be a number from 0\.1 to 100, got -1/);
        expect(issues.join("\n")).toMatch(/surface\.roughness/);
        expect(issues.join("\n")).toMatch(/macro\.strataNormal must be three finite numbers of non-zero length/);
    });

    it("reject unknown and missing fields instead of falling back on a default", () => {
        const settings = JSON.parse(JSON.stringify(ROCK_PRESET_DARK_SLATE)) as Record<string, unknown>;
        settings["colour"] = "red";
        delete (settings["micro"] as Record<string, unknown>)["relief"];
        (settings["micro"] as Record<string, unknown>)["releif"] = 0.01;
        const issues = issuesOf(settings);
        expect(issues).toContain("colour is not a rock setting");
        expect(issues).toContain("micro.releif is not a rock setting");
        expect(issues.some((issue) => issue.startsWith("micro.relief must be a number"))).toBe(true);
    });

    it("check the seed, the palette and the quality", () => {
        const base = (): IRockSettings => createRockSettings();
        expect(issuesOf({ ...base(), seed: 1.5 })[0]).toMatch(/^seed must be an integer/);
        expect(issuesOf({ ...base(), seed: 2 ** 32 })[0]).toMatch(/^seed/);
        expect(issuesOf({ ...base(), palette: ["#000000", "#111111"] })[0]).toMatch(/palette must hold 3 to 5 colours/);
        expect(issuesOf({ ...base(), palette: ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555"] })[0]).toMatch(/3 to 5/);
        expect(issuesOf({ ...base(), palette: ["#000000", "red", "#222222"] })[0]).toMatch(/palette\[1\] must be "#rrggbb"/);
        expect(issuesOf({ ...base(), quality: "ultra" })[0]).toMatch(/quality must be "low", "medium" or "high"/);
        expect(issuesOf({ ...base(), meso: { ...base().meso, secondaryCellSize: 5 } })[0]).toMatch(/smaller than meso\.cellSize/);
        expect(issuesOf({ ...base(), meso: { ...base().meso, cavityDarkening: 0.6 } })[0]).toMatch(/cavityDarkening/);
    });

    it("reject what is not an object", () => {
        expect(() => validateRockSettings(null)).toThrow(RockSettingsError);
        expect(() => validateRockSettings([1, 2])).toThrow(/settings must be an object/);
        expect(() => createRockSettings({ seed: -3 })).toThrow(RockSettingsError);
    });
});
