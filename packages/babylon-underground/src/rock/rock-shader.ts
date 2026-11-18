import { rockFragmentDefinitions } from "./shaders/snippets/rockFragmentDefinitions";
import { rockFragmentMainBegin } from "./shaders/snippets/rockFragmentMainBegin";
import { rockFragmentUpdateAlbedo } from "./shaders/snippets/rockFragmentUpdateAlbedo";
import { rockFragmentUpdateNormal } from "./shaders/snippets/rockFragmentUpdateNormal";
import { rockFragmentUpdateOcclusion } from "./shaders/snippets/rockFragmentUpdateOcclusion";
import { rockFragmentUpdateRoughness } from "./shaders/snippets/rockFragmentUpdateRoughness";
import { rockNoise } from "./shaders/snippets/rockNoise";
import { rockUniforms } from "./shaders/snippets/rockUniforms";
import { rockVertexDefinitions } from "./shaders/snippets/rockVertexDefinitions";
import { rockVertexMainEnd } from "./shaders/snippets/rockVertexMainEnd";
import { ROCK_UNIFORM_NAMES } from "./rock-uniforms";

/** Languages the rock is written in. WGSL is planned: its twins will live in `shaders/wgsl`, as in the core package. */
export type RockShaderLanguage = "GLSL";

/**
 * The PBR material has no named injection point between its ambient occlusion and its first use of it. The plugin
 * then injects after this statement of the PBR fragment shader of Babylon.js 9.33, through a regular expression; a
 * test checks that the shader still contains it.
 */
export const ROCK_OCCLUSION_ANCHOR = "float microSurface=reflectivityOut.microSurface;";

/** Injection point name of the occlusion: `!` marks a regular expression for the plugin manager of Babylon.js. */
export const ROCK_OCCLUSION_POINT = `!${ROCK_OCCLUSION_ANCHOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;

/** Named injection points of the PBR material the rock uses, by shader stage. */
export const ROCK_INJECTION_POINTS = {
    vertex: ["CUSTOM_VERTEX_DEFINITIONS", "CUSTOM_VERTEX_MAIN_END"],
    fragment: [
        "CUSTOM_FRAGMENT_DEFINITIONS",
        "CUSTOM_FRAGMENT_MAIN_BEGIN",
        "CUSTOM_FRAGMENT_UPDATE_ALBEDO",
        "CUSTOM_FRAGMENT_UPDATE_ALPHA",
        "CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS",
    ],
} as const;

/** Uniform buffer layout of the rock: every uniform is a vec4. */
export function rockUniformBufferLayout(): { name: string; size: number; type: string }[] {
    return ROCK_UNIFORM_NAMES.map((name) => ({ name, size: 4, type: "vec4" }));
}

/** Declarations of the rock uniforms outside a uniform buffer. */
export function rockUniformDeclarations(_language: RockShaderLanguage = "GLSL"): string {
    return rockUniforms.shader;
}

/** The code the rock injects in one stage of the PBR material. */
export function rockCustomCode(shaderType: string, _language: RockShaderLanguage = "GLSL"): Record<string, string> | null {
    if (shaderType === "vertex") {
        return {
            CUSTOM_VERTEX_DEFINITIONS: rockVertexDefinitions.shader,
            CUSTOM_VERTEX_MAIN_END: rockVertexMainEnd.shader,
        };
    }
    if (shaderType === "fragment") {
        return {
            CUSTOM_FRAGMENT_DEFINITIONS: `${rockNoise.shader}\n${rockFragmentDefinitions.shader}`,
            CUSTOM_FRAGMENT_MAIN_BEGIN: rockFragmentMainBegin.shader,
            CUSTOM_FRAGMENT_UPDATE_ALBEDO: rockFragmentUpdateAlbedo.shader,
            // The last named point after the final normal, before any lighting reads it.
            CUSTOM_FRAGMENT_UPDATE_ALPHA: rockFragmentUpdateNormal.shader,
            CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: rockFragmentUpdateRoughness.shader,
            // $0 is the matched statement, kept in place.
            [ROCK_OCCLUSION_POINT]: `$0\n${rockFragmentUpdateOcclusion.shader}`,
        };
    }
    return null;
}
