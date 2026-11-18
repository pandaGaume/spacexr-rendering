import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import "@babylonjs/core/Shaders/pbr.fragment.js";
import "@babylonjs/core/Shaders/pbr.vertex.js";
import { describe, expect, it } from "vitest";

import { buildShaders } from "../../tools/src/build-shaders";
import {
    computeRockUniforms,
    createRockSettings,
    ROCK_INJECTION_POINTS,
    ROCK_OCCLUSION_ANCHOR,
    ROCK_OCCLUSION_POINT,
    ROCK_UNIFORM_NAMES,
    rockCustomCode,
    rockUniformBufferLayout,
    rockUniformDeclarations,
} from "../src";

const SOURCE = fileURLToPath(new URL("../src", import.meta.url));
const SNIPPETS = join(SOURCE, "rock", "shaders", "snippets");
/** Every folder of shader files of the package: the rock, and the rock face. */
const ALL_SNIPPETS = [SNIPPETS, join(SOURCE, "rock-face", "shaders", "snippets")];

/** The PBR shaders of Babylon.js with their includes resolved, recursively, as the plugin manager sees them. */
function resolved(shader: string): string {
    return shader.replace(/#include<(\w+)>(\[[^\]]*\])?(\([^)]*\))?/g, (_match, name: string) => {
        const include = ShaderStore.IncludesShadersStore[name];
        return include === undefined ? "" : resolved(include);
    });
}

async function pbrFragment(): Promise<string> {
    // The includes the PBR fragment uses register themselves when imported.
    await import("@babylonjs/core/Shaders/ShadersInclude/pbrBlockAlbedoOpacity.js");
    await import("@babylonjs/core/Shaders/ShadersInclude/pbrBlockReflectivity.js");
    await import("@babylonjs/core/Shaders/ShadersInclude/pbrBlockNormalGeometric.js");
    await import("@babylonjs/core/Shaders/ShadersInclude/pbrBlockNormalFinal.js");
    return resolved(ShaderStore.ShadersStore["pbrPixelShader"]!);
}

function directivesBalance(code: string): boolean {
    let depth = 0;
    for (const line of code.split("\n")) {
        if (/^#if/.test(line)) depth++;
        if (/^#endif/.test(line)) depth--;
        if (depth < 0) return false;
    }
    return depth === 0;
}

describe("rock shader assembly", () => {
    it("declares every uniform it sets, and sets every uniform it declares", () => {
        const declared = [...rockUniformDeclarations().matchAll(/uniform vec4 (\w+);/g)].map((match) => match[1]);
        expect(declared).toEqual([...ROCK_UNIFORM_NAMES]);
        expect(rockUniformBufferLayout().map((entry) => entry.name)).toEqual([...ROCK_UNIFORM_NAMES]);
        expect(rockUniformBufferLayout().every((entry) => entry.size === 4 && entry.type === "vec4")).toBe(true);
        expect(Object.keys(computeRockUniforms(createRockSettings())).sort()).toEqual([...ROCK_UNIFORM_NAMES].sort());
    });

    it("uses only declared rock uniforms, and uses each of them", () => {
        const fragment = rockCustomCode("fragment")!;
        const code = Object.values(fragment).join("\n");
        const declaredGlobals = new Set([
            ...ROCK_UNIFORM_NAMES,
            "rockAlbedo",
            "rockRoughness",
            "rockOcclusion",
            "rockGradient",
            "rockDpdx",
            "rockDpdy",
            "rockDwdx",
            "rockDwdy",
            "rockDetailNormalSampler",
        ]);
        const functions = new Set([...code.matchAll(/\b(rock\w+)\s*\(/g)].map((match) => match[1]));
        const identifiers = new Set([...code.matchAll(/\brock[A-Z]\w*/g)].map((match) => match[0]));
        for (const identifier of identifiers) {
            if (functions.has(identifier)) continue;
            expect(declaredGlobals.has(identifier), identifier).toBe(true);
        }
        for (const name of ROCK_UNIFORM_NAMES) expect(identifiers.has(name), name).toBe(true);
    });

    it("keeps preprocessor blocks balanced in every injected piece", () => {
        for (const stage of ["vertex", "fragment"]) {
            for (const [point, code] of Object.entries(rockCustomCode(stage)!))
                expect(directivesBalance(code), `${stage} ${point}`).toBe(true);
        }
        expect(directivesBalance(rockUniformDeclarations())).toBe(true);
    });

    it("injects at the named points it lists, and at the occlusion anchor", () => {
        expect(Object.keys(rockCustomCode("vertex")!)).toEqual([...ROCK_INJECTION_POINTS.vertex]);
        expect(Object.keys(rockCustomCode("fragment")!)).toEqual([...ROCK_INJECTION_POINTS.fragment, ROCK_OCCLUSION_POINT]);
        expect(rockCustomCode("compute")).toBeNull();
        expect(new RegExp(ROCK_OCCLUSION_POINT.slice(1)).test(ROCK_OCCLUSION_ANCHOR)).toBe(true);
        expect(rockCustomCode("fragment")![ROCK_OCCLUSION_POINT]!.startsWith("$0\n")).toBe(true);
    });

    it("finds its injection points and variables in the PBR shaders of Babylon.js", async () => {
        const fragment = await pbrFragment();
        const vertex = resolved(ShaderStore.ShadersStore["pbrVertexShader"]!);
        for (const point of ROCK_INJECTION_POINTS.fragment) expect(fragment.includes(`#define ${point}`), point).toBe(true);
        for (const point of ROCK_INJECTION_POINTS.vertex) expect(vertex.includes(`#define ${point}`), point).toBe(true);
        expect(fragment.split(ROCK_OCCLUSION_ANCHOR)).toHaveLength(2);
        // The anchor follows the ambient occlusion block, so aoOut exists there.
        expect(fragment.indexOf("aoOut=ambientOcclusionBlock(")).toBeLessThan(fragment.indexOf(ROCK_OCCLUSION_ANCHOR));
        // The normal is final before the albedo block, and the normal update comes before any light.
        expect(fragment.indexOf("vec3 geometricNormalW=normalW;")).toBeLessThan(fragment.indexOf("#define CUSTOM_FRAGMENT_UPDATE_ALPHA"));
        expect(fragment.indexOf("#define CUSTOM_FRAGMENT_UPDATE_ALPHA")).toBeLessThan(
            fragment.indexOf("#define CUSTOM_FRAGMENT_BEFORE_LIGHTS"),
        );
        expect(fragment).toMatch(/varying vec3 vPositionW;/);
        expect(fragment).toMatch(/surfaceAlbedo\*=albedoInfos\.y|surfaceAlbedo=/);
        expect(fragment).toMatch(/metallicRoughness\.g/);
        expect(vertex).toMatch(/vec3 positionUpdated=position;/);
        expect(vertex).toMatch(/vec3 normalUpdated=normal;/);
    });

    it("has generated modules that match their shader files", () => {
        const report = buildShaders(SOURCE, { check: true });
        expect(report.unchanged.length).toBe(
            ALL_SNIPPETS.flatMap((folder) => readdirSync(folder)).filter((file) => file.endsWith(".glsl")).length,
        );
        expect(report.changed).toEqual([]);
        expect(report.orphans).toEqual([]);
    });

    it("writes no em dash in its shaders", () => {
        for (const folder of ALL_SNIPPETS)
            for (const file of readdirSync(folder))
                expect(readFileSync(join(folder, file), "utf8").includes(String.fromCharCode(0x2014)), file).toBe(false);
    });
});
