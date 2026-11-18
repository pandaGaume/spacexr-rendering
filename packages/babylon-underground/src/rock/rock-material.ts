import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { rockCustomCode, rockUniformBufferLayout, rockUniformDeclarations } from "./rock-shader";
import { createRockSettings, validateRockSettings } from "./rock-settings";
import type { IRockSettings } from "./rock-settings";
import { computeRockUniforms, ROCK_UNIFORM_NAMES } from "./rock-uniforms";
import type { RockUniforms } from "./rock-uniforms";

class RockDefines extends MaterialDefines {
    public ROCKMATERIAL = false;
    public ROCKDETAILNORMAL = false;
}

/** Sampler of the optional detail normal map. */
export const ROCK_DETAIL_NORMAL_SAMPLER = "rockDetailNormalSampler";

/**
 * PBR material plugin drawing a procedural rock: albedo, normal, roughness and ambient occlusion, from the mesh-local
 * position in metres. The mesh needs positions, and normals for smooth shading; no UVs, no tangents. Lighting, shadows,
 * fog and image processing remain those of the PBR material.
 *
 * The plugin owns the roughness of the material; the albedo colour of the material tints the rock. Changing settings
 * only updates uniforms, except enabling the detail normal map, which recompiles the material.
 */
export class RockMaterialPlugin extends MaterialPluginBase {
    private _settings: IRockSettings;
    private _uniforms: RockUniforms;
    private _enabled = true;
    private _detailNormalTexture: BaseTexture | null = null;

    public constructor(
        private readonly _pbr: PBRBaseMaterial,
        settings: IRockSettings = createRockSettings(),
    ) {
        super(_pbr, "Rock", 200, new RockDefines());
        this._settings = validateRockSettings(settings);
        this._uniforms = computeRockUniforms(this._settings);
        this._enable(true);
    }

    public override getClassName(): string {
        return "RockMaterialPlugin";
    }

    /** A copy of the current settings. */
    public get settings(): IRockSettings {
        return JSON.parse(JSON.stringify(this._settings)) as IRockSettings;
    }

    /** The uniform values sent to the shader, for inspection. */
    public get uniforms(): Readonly<RockUniforms> {
        return this._uniforms;
    }

    /**
     * Replaces the settings.
     *
     * @throws RockSettingsError When they are invalid; the current settings are then kept.
     */
    public setSettings(settings: IRockSettings): void {
        const valid = validateRockSettings(settings);
        const detailChanged = valid.detail.enabled !== this._settings.detail.enabled;
        this._settings = valid;
        this._uniforms = computeRockUniforms(valid);
        if ("metallicF0Factor" in this._pbr) (this._pbr as PBRMaterial).metallicF0Factor = valid.surface.specular;
        if (detailChanged) this.markAllDefinesAsDirty();
    }

    /** Shows the plain PBR material when false. */
    public get isEnabled(): boolean {
        return this._enabled;
    }

    public set isEnabled(value: boolean) {
        if (this._enabled === value) return;
        this._enabled = value;
        this.markAllDefinesAsDirty();
    }

    /**
     * Optional tiling detail normal map, tangent space, sampled triplanar in rock space when `detail.enabled` is true.
     * It should have mipmaps and wrap. No texture is shipped.
     */
    public get detailNormalTexture(): BaseTexture | null {
        return this._detailNormalTexture;
    }

    public set detailNormalTexture(texture: BaseTexture | null) {
        if (this._detailNormalTexture === texture) return;
        this._detailNormalTexture = texture;
        this.markAllDefinesAsDirty();
    }

    /** GLSL on WebGL 2, for its unsigned integers. A WGSL twin of the snippets is planned, not written. */
    public override isCompatible(shaderLanguage: ShaderLanguage): boolean {
        const engine = this._material.getScene().getEngine() as AbstractEngine & { webGLVersion?: number };
        return shaderLanguage === ShaderLanguage.GLSL && !engine.isWebGPU && (engine.webGLVersion ?? 0) >= 2;
    }

    public override isReadyForSubMesh(_defines: MaterialDefines, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): boolean {
        return !this.usesDetail() || (this._detailNormalTexture?.isReady() ?? true);
    }

    public override prepareDefines(defines: MaterialDefines): void {
        defines["ROCKMATERIAL"] = this._enabled;
        defines["ROCKDETAILNORMAL"] = this.usesDetail();
    }

    public override getSamplers(samplers: string[]): void {
        samplers.push(ROCK_DETAIL_NORMAL_SAMPLER);
    }

    public override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
        return { ubo: rockUniformBufferLayout(), fragment: rockUniformDeclarations() };
    }

    public override bindForSubMesh(uniformBuffer: UniformBuffer): void {
        if (!this._enabled) return;
        for (const name of ROCK_UNIFORM_NAMES) {
            const [x, y, z, w] = this._uniforms[name];
            uniformBuffer.updateFloat4(name, x, y, z, w);
        }
        if (this.usesDetail()) uniformBuffer.setTexture(ROCK_DETAIL_NORMAL_SAMPLER, this._detailNormalTexture);
    }

    public override hasTexture(texture: BaseTexture): boolean {
        return texture === this._detailNormalTexture;
    }

    public override getActiveTextures(activeTextures: BaseTexture[]): void {
        if (this._detailNormalTexture) activeTextures.push(this._detailNormalTexture);
    }

    public override getAnimatables(animatables: unknown[]): void {
        if (this._detailNormalTexture?.animations?.length) animatables.push(this._detailNormalTexture);
    }

    public override getCustomCode(shaderType: string): Record<string, string> | null {
        return rockCustomCode(shaderType);
    }

    private usesDetail(): boolean {
        return this._enabled && this._settings.detail.enabled && this._detailNormalTexture !== null;
    }
}

/** A PBR material with its rock plugin. */
export interface IRockMaterial {
    readonly material: PBRMaterial;
    readonly plugin: RockMaterialPlugin;
}

/**
 * Creates the rock material: a PBR material, dielectric, white albedo, specular anti-aliasing on, with a
 * {@link RockMaterialPlugin}. Settings default to the dark slate preset.
 *
 * @throws RockSettingsError When the settings are invalid.
 */
export function createRockMaterial(name: string, scene: Scene, settings: IRockSettings = createRockSettings()): IRockMaterial {
    const valid = validateRockSettings(settings);
    const material = new PBRMaterial(name, scene);
    material.albedoColor = Color3.White();
    material.metallic = 0;
    // Overridden per pixel by the plugin; set so that the material uses the metallic workflow.
    material.roughness = 1;
    material.metallicF0Factor = valid.surface.specular;
    // Raises the roughness where the normal changes within a pixel: less shimmer at distance.
    material.enableSpecularAntiAliasing = true;
    const plugin = new RockMaterialPlugin(material, valid);
    return { material, plugin };
}
