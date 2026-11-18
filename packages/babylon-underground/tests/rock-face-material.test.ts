import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRockFaceMaterial, ROCK_FACE_DETAIL, ROCK_FACE_HANDOVER, ROCK_FACE_OCTAVES, RockFacePlugin } from "../src";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    (engine as unknown as { _webGLVersion: number })._webGLVersion = 2;
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

describe("rock face material", () => {
    it("is a rough dark PBR material whose relief per pixel starts under the wavelength of the mesh", () => {
        const { material, plugin } = createRockFaceMaterial("face", scene, { detailWavelength: 10 });
        expect(material.metallic).toBe(0);
        expect(material.roughness).toBeCloseTo(0.92);
        expect(plugin).toBeInstanceOf(RockFacePlugin);
        expect(plugin.detail).toEqual({ ...ROCK_FACE_DETAIL, largestWavelength: ROCK_FACE_HANDOVER * 10 });
        expect(plugin.octaves).toBe(ROCK_FACE_OCTAVES);
    });

    it("injects after the final normal and the albedo of a PBR material, with its octaves as a define", () => {
        const { plugin } = createRockFaceMaterial("face", scene, { detailWavelength: 10, octaves: 4 });
        const code = plugin.getCustomCode("fragment")!;
        expect(Object.keys(code).sort()).toEqual(["CUSTOM_FRAGMENT_BEFORE_LIGHTS", "CUSTOM_FRAGMENT_DEFINITIONS"]);
        expect(code["CUSTOM_FRAGMENT_BEFORE_LIGHTS"]).toContain("#define RF_ALBEDO surfaceAlbedo");
        expect(code["CUSTOM_FRAGMENT_DEFINITIONS"]).toContain("ROCKFACE_OCTAVES");
        expect(plugin.getCustomCode("vertex")).toBeNull();
        const defines = new MaterialDefines();
        plugin.prepareDefines(defines);
        expect(defines["ROCKFACE"]).toBe(true);
        expect(defines["ROCKFACE_OCTAVES"]).toBe(4);
    });

    it("works on a standard material too, on its diffuse colour", () => {
        const plugin = new RockFacePlugin(new StandardMaterial("plain", scene), { ...ROCK_FACE_DETAIL, largestWavelength: 6 }, 99);
        const code = plugin.getCustomCode("fragment")!;
        expect(code["CUSTOM_FRAGMENT_UPDATE_DIFFUSE"]).toContain("#define RF_ALBEDO baseColor.rgb");
        expect(plugin.octaves).toBe(10);
    });

    it("computes its noise in the shader unless it is given a baked one, which it then reads", () => {
        const computed = createRockFaceMaterial("computed", scene, { detailWavelength: 10 }).plugin;
        expect(computed.noise).toBeNull();
        const defines = new MaterialDefines();
        computed.prepareDefines(defines);
        expect(defines["ROCKFACE_BAKED"]).toBe(false);
        expect(computed.isReadyForSubMesh()).toBe(true);

        // A texture that is not loaded yet holds the material back.
        let ready = false;
        const texture = { isReady: () => ready } as unknown as BaseTexture;
        const baked = createRockFaceMaterial("baked", scene, { detailWavelength: 10, noise: { texture, cells: 32, samples: 4 } }).plugin;
        baked.prepareDefines(defines);
        expect(defines["ROCKFACE_BAKED"]).toBe(true);
        expect(baked.isReadyForSubMesh()).toBe(false);
        ready = true;
        expect(baked.isReadyForSubMesh()).toBe(true);
        const samplers: string[] = [];
        baked.getSamplers(samplers);
        expect(samplers).toEqual(["rockFaceNoise"]);
        const textures: BaseTexture[] = [];
        baked.getActiveTextures(textures);
        expect(textures).toEqual([texture]);
        expect(baked.hasTexture(texture)).toBe(true);
        expect(computed.hasTexture(texture)).toBe(false);
        // Both branches are in the one shader, told apart by the define.
        const code = baked.getCustomCode("fragment")!["CUSTOM_FRAGMENT_DEFINITIONS"]!;
        expect(code).toContain("#ifdef ROCKFACE_BAKED");
        expect(code).toContain("sampler3D rockFaceNoise");
        expect(code).toContain("rfPcg");
        expect(baked.getUniforms().ubo.map((uniform) => uniform.name)).toEqual(["rockFace", "rockFaceLattice"]);
    });

    it("refuses a detail wavelength that is not positive", () => {
        expect(() => createRockFaceMaterial("face", scene, { detailWavelength: 0 })).toThrow(RangeError);
    });
});
