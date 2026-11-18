import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Light } from "@babylonjs/core/Lights/light.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    CHAMBER_LIGHTING_DEFAULTS,
    computeRockUniforms,
    createChamberLighting,
    createRockMaterial,
    createRockSettings,
    kelvinToLinearRgb,
    ROCK_UNIFORM_NAMES,
    RockMaterialPlugin,
    RockSettingsError,
} from "../src";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    // The null engine reports WebGL 1; the rock needs WebGL 2, which these tests emulate.
    (engine as unknown as { _webGLVersion: number })._webGLVersion = 2;
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

describe("rock material", () => {
    it("is a matte dielectric PBR material carrying the rock plugin", () => {
        const { material, plugin } = createRockMaterial("rock", scene);
        expect(material.metallic).toBe(0);
        expect(material.metallicF0Factor).toBe(0.5);
        expect(material.enableSpecularAntiAliasing).toBe(true);
        expect(plugin).toBeInstanceOf(RockMaterialPlugin);
        expect(material.pluginManager?.getPlugin("Rock")).toBe(plugin);
        expect(plugin.getClassName()).toBe("RockMaterialPlugin");
    });

    it("declares all its uniforms and its sampler", () => {
        const { plugin } = createRockMaterial("rock", scene);
        expect(plugin.getUniforms().ubo.map((entry) => entry.name)).toEqual([...ROCK_UNIFORM_NAMES]);
        const samplers: string[] = [];
        plugin.getSamplers(samplers);
        expect(samplers).toEqual(["rockDetailNormalSampler"]);
    });

    it("binds every uniform it declares", () => {
        const { plugin } = createRockMaterial("rock", scene, createRockSettings({ seed: 5 }));
        const bound = new Map<string, number[]>();
        const buffer = {
            updateFloat4: (name: string, x: number, y: number, z: number, w: number) => bound.set(name, [x, y, z, w]),
            setTexture: () => undefined,
        };
        plugin.bindForSubMesh(buffer as never);
        expect([...bound.keys()]).toEqual([...ROCK_UNIFORM_NAMES]);
        const expected = computeRockUniforms(createRockSettings({ seed: 5 }));
        for (const name of ROCK_UNIFORM_NAMES) expect(bound.get(name)).toEqual(expected[name]);
    });

    it("keeps its settings when new ones are invalid", () => {
        const { plugin } = createRockMaterial("rock", scene, createRockSettings({ seed: 3 }));
        const before = plugin.uniforms;
        expect(() => plugin.setSettings({ ...plugin.settings, seed: -1 })).toThrow(RockSettingsError);
        expect(plugin.settings.seed).toBe(3);
        expect(plugin.uniforms).toBe(before);
        plugin.setSettings(createRockSettings({ seed: 4, surface: { specular: 0.25 } }));
        expect(plugin.settings.seed).toBe(4);
        expect(plugin.uniforms.rockSeed).not.toEqual(before.rockSeed);
    });

    it("updates the specular of its material with its settings", () => {
        const { material, plugin } = createRockMaterial("rock", scene);
        plugin.setSettings(createRockSettings({ surface: { specular: 0.25 } }));
        expect(material.metallicF0Factor).toBe(0.25);
    });

    it("runs on GLSL only", () => {
        const { plugin } = createRockMaterial("rock", scene);
        expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(false);
    });

    it("refuses WebGL 1", () => {
        (engine as unknown as { _webGLVersion: number })._webGLVersion = 1;
        expect(() => createRockMaterial("rock", scene)).toThrow(/not compatible/);
    });

    it("rejects invalid settings at creation", () => {
        expect(() => createRockMaterial("rock", scene, { ...createRockSettings(), palette: [] })).toThrow(RockSettingsError);
    });
});

describe("chamber lighting", () => {
    it("is a warm physical point lamp and a weak cold fill without specular", () => {
        const lighting = createChamberLighting(scene, { lamp: { position: [1, 2, 3], intensity: 250, range: 60 } });
        expect(lighting.lamp.falloffType).toBe(Light.FALLOFF_PHYSICAL);
        expect(lighting.lamp.intensity).toBe(250);
        expect(lighting.lamp.range).toBe(60);
        expect(lighting.lamp.position.asArray()).toEqual([1, 2, 3]);
        const { r, g, b } = lighting.lamp.diffuse;
        expect(r).toBe(1);
        expect(r > g && g > b).toBe(true);
        const fill = lighting.fill;
        expect(fill.intensity).toBe(CHAMBER_LIGHTING_DEFAULTS.fill.intensity);
        expect(fill.diffuse.b).toBeGreaterThan(fill.diffuse.r);
        expect(fill.specular.asArray()).toEqual([0, 0, 0]);
        lighting.dispose();
        expect(scene.lights).toHaveLength(0);
    });

    it("rejects invalid options", () => {
        expect(() => createChamberLighting(scene, { lamp: { temperature: 200 } })).toThrow(/lamp\.temperature/);
        expect(() => createChamberLighting(scene, { fill: { color: "blue", direction: [0, 0, 0] } })).toThrow(
            /fill\.direction[\s\S]*fill\.color/,
        );
    });

    it("gives black body colours", () => {
        const warm = kelvinToLinearRgb(3000);
        expect(warm[0]).toBe(1);
        expect(warm[2]).toBeLessThan(0.35);
        const daylight = kelvinToLinearRgb(6600);
        expect(Math.min(...daylight)).toBeGreaterThan(0.9);
        expect(() => kelvinToLinearRgb(500)).toThrow();
    });
});
