import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { rockFaceDefinitions } from "./shaders/snippets/rockFaceDefinitions";
import type { IRockFaceNoise } from "./rock-noise";
import { rockFaceMain } from "./shaders/snippets/rockFaceMain";

/**
 * The rock of a rock face, per pixel: the relief its mesh cannot carry.
 *
 * `buildRockFace` of `@spacexr/ceiling` (terrain-core) moves a mesh into the rock with every wavelength of its field
 * over `detailWavelength`, and leaves the shorter ones out. This plugin carries on from there in the fragment shader:
 * 3D value noise with its exact gradient, read at the world position (no UV, no tiling, no seam), projected on the
 * surface to tilt the normal, with the hollows darkened and a grain in the albedo. Octaves under about two pixels
 * fade out, so the rock does not shimmer.
 *
 * The noise is computed in the shader, eight hashes an octave, or read from a 3D texture it was baked into
 * (`createRockNoiseTexture`), one read an octave: the same rock, at a cost a mobile headset can pay.
 *
 * GLSL on WebGL 2 only: under WebGPU the plugin stands aside and the face shows the relief of its mesh alone.
 */

/** How the rock face is drawn per pixel. Changes show on the next frame, without recompiling. */
export interface IRockFaceDetail {
    /** Wavelength of the largest octave, in metres: where the relief of the mesh stops. */
    largestWavelength: number;
    /** How much the relief tilts the normal; 0 leaves the normal of the mesh. */
    strength: number;
    /** How much the hollows of the relief are darkened, 0 to 1. */
    cavity: number;
    /** Variation of the albedo at 2.2 m and 0.6 m, 0 to 1; 0 skips its cost. */
    grain: number;
}

/** The look of the SpaceXR V26 rock walls. */
export const ROCK_FACE_DETAIL: Readonly<Omit<IRockFaceDetail, "largestWavelength">> = { strength: 1.8, cavity: 0.35, grain: 0.22 };
/** Octaves of the relief per pixel on a desktop: from the largest wavelength down to 1/64 of it. */
export const ROCK_FACE_OCTAVES = 7;
/**
 * Largest octave per pixel over the shortest wavelength of the mesh: a little more than one octave under it, as in
 * V26. `RATIONALE_UNKNOWN` beyond the look it gave there.
 */
export const ROCK_FACE_HANDOVER = 0.6;

/** The plugin of a rock face, on a PBR or a standard material. */
export class RockFacePlugin extends MaterialPluginBase {
    readonly detail: IRockFaceDetail;
    /**
     * Octaves of the relief per pixel, 1 to 10. Each costs eight hashes a pixel when the noise is computed, one read
     * of a texture when it is baked.
     */
    readonly octaves: number;
    /** The baked noise the relief is read from, or null when the shader computes it. */
    readonly noise: IRockFaceNoise | null;

    constructor(material: Material, detail: IRockFaceDetail, octaves: number = ROCK_FACE_OCTAVES, noise: IRockFaceNoise | null = null) {
        // The base constructor already asks for the custom code, to learn its injection points: what that code
        // depends on must not be a field set after it.
        super(material, "RockFace", 200, { ROCKFACE: false, ROCKFACE_OCTAVES: ROCK_FACE_OCTAVES, ROCKFACE_BAKED: false });
        this.detail = { ...detail };
        this.octaves = Math.max(1, Math.min(10, Math.round(octaves)));
        this.noise = noise;
        this._enable(true);
    }

    override getClassName(): string {
        return "RockFacePlugin";
    }

    override isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL;
    }

    override prepareDefines(defines: MaterialDefines): void {
        defines["ROCKFACE"] = true;
        defines["ROCKFACE_OCTAVES"] = this.octaves;
        defines["ROCKFACE_BAKED"] = this.noise !== null;
    }

    override isReadyForSubMesh(): boolean {
        return this.noise === null || this.noise.texture.isReady();
    }

    override getSamplers(samplers: string[]): void {
        samplers.push("rockFaceNoise");
    }

    override getActiveTextures(activeTextures: BaseTexture[]): void {
        if (this.noise) activeTextures.push(this.noise.texture);
    }

    override hasTexture(texture: BaseTexture): boolean {
        return this.noise?.texture === texture;
    }

    override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
        return {
            ubo: [
                { name: "rockFace", size: 4, type: "vec4" },
                { name: "rockFaceLattice", size: 2, type: "vec2" },
            ],
            fragment: "#ifdef ROCKFACE\nuniform vec4 rockFace;\nuniform vec2 rockFaceLattice;\n#endif",
        };
    }

    override bindForSubMesh(uniformBuffer: UniformBuffer, _scene?: Scene, _engine?: AbstractEngine): void {
        const { largestWavelength, strength, cavity, grain } = this.detail;
        uniformBuffer.updateFloat4("rockFace", largestWavelength, strength, cavity, grain);
        if (!this.noise) return;
        // A point in cells goes to the texture by one over its cells, and half a texel: a texel holds the noise at
        // its lower corner.
        const { texture, cells, samples } = this.noise;
        uniformBuffer.updateFloat2("rockFaceLattice", 1 / cells, 0.5 / (cells * samples));
        uniformBuffer.setTexture("rockFaceNoise", texture);
    }

    override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
        if (shaderType !== "fragment") return null;
        // Both points come after the final normal and the albedo, before the lights.
        return this._material instanceof PBRMaterial
            ? {
                  CUSTOM_FRAGMENT_DEFINITIONS: rockFaceDefinitions.shader,
                  CUSTOM_FRAGMENT_BEFORE_LIGHTS: `#define RF_ALBEDO surfaceAlbedo\n${rockFaceMain.shader}`,
              }
            : {
                  CUSTOM_FRAGMENT_DEFINITIONS: rockFaceDefinitions.shader,
                  CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#define RF_ALBEDO baseColor.rgb\n${rockFaceMain.shader}`,
              };
    }
}

/** Options of the material of a rock face. */
export interface IRockFaceMaterialOptions {
    /** Where the relief of the mesh stops, in metres: `detailWavelength` of `buildRockFace`. */
    detailWavelength: number;
    /** Albedo, linear. Dark slate by default. */
    albedo?: Color3;
    detail?: Partial<Omit<IRockFaceDetail, "largestWavelength">>;
    /** Octaves of the relief per pixel; `ROCK_FACE_OCTAVES` by default. */
    octaves?: number;
    /** The baked noise of `createRockNoiseTexture`, to read the relief from; computed in the shader by default. */
    noise?: IRockFaceNoise;
}

/** A rough, dark, non-metallic PBR rock with the relief of a rock face per pixel. */
export function createRockFaceMaterial(
    name: string,
    scene: Scene,
    options: IRockFaceMaterialOptions,
): { material: PBRMaterial; plugin: RockFacePlugin } {
    if (!(options.detailWavelength > 0)) throw new RangeError("A rock face needs a positive detail wavelength.");
    const material = new PBRMaterial(name, scene);
    material.albedoColor = options.albedo ?? new Color3(0.2, 0.21, 0.24);
    material.metallic = 0;
    material.roughness = 0.92;
    const detail: IRockFaceDetail = {
        ...ROCK_FACE_DETAIL,
        ...options.detail,
        largestWavelength: ROCK_FACE_HANDOVER * options.detailWavelength,
    };
    const plugin = new RockFacePlugin(material, detail, options.octaves ?? ROCK_FACE_OCTAVES, options.noise ?? null);
    return { material, plugin };
}
