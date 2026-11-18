import "./style.css";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Ray } from "@babylonjs/core/Culling/ray.core.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createChamberLighting, createRockMaterial, createRockSettings } from "@spacexr/babylon-underground";
import type { IRockSettings, RockQuality } from "@spacexr/babylon-underground";

import { createCavity, createFlatCavity } from "./cavity";
import { createTestObjects } from "./test-objects";

type PresetName = "near" | "mid" | "far";

/**
 * A camera preset: the distance from the wall point, and where the lamp stands, in metres along the wall normal, the
 * horizontal tangent and the vertical tangent, with its intensity in candela. The lamp moves with the view as a
 * lighting rig would, so that each view receives a comparable illuminance on the wall.
 */
interface IPreset {
    distance: number;
    lamp: [number, number, number];
    intensity: number;
    range: number;
}

const PRESETS: Readonly<Record<PresetName, IPreset>> = {
    near: { distance: 2, lamp: [0.9, 2.4, 1.4], intensity: 45, range: 40 },
    mid: { distance: 20, lamp: [5, 14, 8], intensity: 900, range: 120 },
    far: { distance: 100, lamp: [40, 25, 18], intensity: 8000, range: 300 },
};

const QUALITIES: readonly RockQuality[] = ["low", "medium", "high"];

interface IFrameCost {
    msPerFrame: number;
    drawCalls: number;
    width: number;
    height: number;
}

interface IExampleApi {
    ready: boolean;
    /** For inspection from the developer tools. */
    scene: Scene;
    setPreset(name: PresetName): Promise<void>;
    setSettings(settings: IRockSettings): Promise<void>;
    settings(): IRockSettings;
    setRockEnabled(enabled: boolean): Promise<void>;
    orbit(radians: number): void;
    measure(): Promise<{ rock: IFrameCost; plain: IFrameCost }>;
}

declare global {
    interface Window {
        __ROCK_EXAMPLE__?: IExampleApi;
    }
}

function required<T extends HTMLElement>(id: string, type: new () => T): T {
    const element = document.getElementById(id);
    if (!(element instanceof type)) throw new Error(`Missing element #${id}.`);
    return element;
}

async function run(): Promise<void> {
    const canvas = required("render-canvas", HTMLCanvasElement);
    const status = required("status", HTMLElement);
    const parameters = new URLSearchParams(window.location.search);
    const engine = new Engine(canvas, parameters.get("antialias") !== "0", {
        useLargeWorldRendering: true,
        preserveDrawingBuffer: true,
        stencil: true,
    });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0, 0, 0, 1);

    const cavity = createCavity(scene);
    let flatCavity: Mesh | undefined;
    let settings = createRockSettings({
        seed: Number(parameters.get("seed") ?? 1),
        quality: (parameters.get("quality") as RockQuality | null) ?? "high",
    });
    const layers = parameters.get("layers");
    if (layers !== null) {
        settings.macro.enabled = layers.includes("a");
        settings.meso.enabled = layers.includes("b");
        settings.micro.enabled = layers.includes("c");
    }
    const rock = createRockMaterial("rock", scene, settings);
    cavity.material = rock.material;
    cavity.receiveShadows = true;

    // The wall point the presets look at: where a ray from the centre meets the cavity.
    const direction = new Vector3(1, -0.12, 0.3).normalize();
    const hit = scene.pickWithRay(new Ray(new Vector3(0, -5, 0), direction, 1000), (mesh) => mesh === cavity);
    if (!hit?.pickedPoint) throw new Error("The wall ray missed the cavity.");
    const anchor = hit.pickedPoint;
    let normal = hit.getNormal(true, true) ?? direction.negate();
    if (Vector3.Dot(normal, direction) > 0) normal = normal.negate();
    const side = Vector3.Cross(normal, Vector3.Up()).normalize();
    const up = Vector3.Cross(side, normal).normalize();
    const along = (n: number, s: number, u: number): Vector3 => anchor.add(normal.scale(n)).add(side.scale(s)).add(up.scale(u));

    const testObjects = createTestObjects(scene, anchor, normal);
    const lighting = createChamberLighting(scene);
    const shadows = new ShadowGenerator(2048, lighting.lamp);
    shadows.usePoissonSampling = true;
    shadows.bias = 0.0004;
    shadows.normalBias = 0.01;
    for (const mesh of testObjects) {
        shadows.addShadowCaster(mesh);
        mesh.receiveShadows = true;
    }
    shadows.addShadowCaster(cavity);

    const camera = new ArcRotateCamera("camera", 0, 1, 10, anchor.clone(), scene);
    camera.minZ = 0.02;
    camera.maxZ = 2000;
    camera.fov = 0.9;
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 400;
    camera.attachControl(canvas, true);

    let presetName: PresetName = "near";
    const applyPreset = (name: PresetName): void => {
        presetName = name;
        const preset = PRESETS[name];
        // Slightly oblique views: relief reads better than head on.
        const view = normal.scale(1).add(side.scale(0.35)).add(up.scale(0.12)).normalize();
        camera.setTarget(anchor.clone());
        camera.setPosition(anchor.add(view.scale(preset.distance)));
        camera.wheelPrecision = 200 / preset.distance;
        camera.panningSensibility = 4000 / preset.distance;
        lighting.lamp.position = along(...preset.lamp);
        lighting.lamp.intensity = preset.intensity;
        lighting.lamp.range = preset.range;
    };
    applyPreset((parameters.get("preset") as PresetName | null) ?? "near");

    const instrumentation = new SceneInstrumentation(scene);
    instrumentation.captureFrameTime = true;
    let measured = "";

    const panel = required("state", HTMLElement);
    const stats = required("stats", HTMLElement);
    const renderPanel = (): void => {
        const on = (value: boolean): string => (value ? "on" : "off");
        panel.textContent = [
            `View ${presetName} (${PRESETS[presetName].distance} m)  [1] [2] [3]`,
            `A macro ${on(settings.macro.enabled)}  B meso ${on(settings.meso.enabled)}  C micro ${on(settings.micro.enabled)}`,
            `Q quality ${settings.quality}  S seed ${settings.seed}`,
            `F normals ${flatCavity?.isEnabled() ? "flat" : "smooth"}  H shadows ${on(lighting.lamp.shadowEnabled)}  R rock ${on(rock.plugin.isEnabled)}`,
            "M measure the frame time, rock on and off",
        ].join("\n");
    };

    const updateSettings = async (next: IRockSettings): Promise<void> => {
        settings = next;
        rock.plugin.setSettings(settings);
        renderPanel();
        await scene.whenReadyAsync();
    };

    const setFlat = (flat: boolean): void => {
        if (flat && !flatCavity) {
            flatCavity = createFlatCavity(cavity);
            flatCavity.material = rock.material;
            flatCavity.receiveShadows = true;
            shadows.addShadowCaster(flatCavity);
        }
        cavity.setEnabled(!flat);
        flatCavity?.setEnabled(flat);
    };

    const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
    /** Renders frames back to back and waits for the GPU: CPU and GPU time of a frame, not limited by the display. */
    const measure = (frames = 60): IFrameCost => {
        const pixel = new Uint8Array(4);
        scene.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const start = performance.now();
        for (let i = 0; i < frames; i++) scene.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const msPerFrame = (performance.now() - start) / frames;
        return {
            msPerFrame,
            drawCalls: instrumentation.drawCallsCounter.current,
            width: engine.getRenderWidth(),
            height: engine.getRenderHeight(),
        };
    };

    const measureBoth = async (): Promise<{ rock: IFrameCost; plain: IFrameCost }> => {
        engine.stopRenderLoop();
        const withRock = measure();
        rock.plugin.isEnabled = false;
        await scene.whenReadyAsync();
        const without = measure();
        rock.plugin.isEnabled = true;
        await scene.whenReadyAsync();
        measured = `rock ${withRock.msPerFrame.toFixed(2)} ms, plain PBR ${without.msPerFrame.toFixed(2)} ms, ${withRock.drawCalls} draw calls, ${withRock.width} x ${withRock.height}`;
        engine.runRenderLoop(render);
        return { rock: withRock, plain: without };
    };

    window.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        const next = createRockSettings(settings);
        if (key === "1") applyPreset("near");
        else if (key === "2") applyPreset("mid");
        else if (key === "3") applyPreset("far");
        else if (key === "a") next.macro.enabled = !next.macro.enabled;
        else if (key === "b") next.meso.enabled = !next.meso.enabled;
        else if (key === "c") next.micro.enabled = !next.micro.enabled;
        else if (key === "q") next.quality = QUALITIES[(QUALITIES.indexOf(next.quality) + 1) % QUALITIES.length]!;
        else if (key === "s") next.seed = (next.seed + 1) >>> 0;
        else if (key === "f") setFlat(!flatCavity?.isEnabled());
        else if (key === "h") lighting.lamp.shadowEnabled = !lighting.lamp.shadowEnabled;
        else if (key === "r") rock.plugin.isEnabled = !rock.plugin.isEnabled;
        else if (key === "m") void measureBoth();
        else return;
        if (JSON.stringify(next) !== JSON.stringify(settings)) void updateSettings(next);
        renderPanel();
    });
    for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
        button.addEventListener("click", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: button.dataset["key"] ?? "" })));
    }

    let frame = 0;
    const render = (): void => {
        scene.render();
        if (++frame % 30 === 0) {
            stats.textContent = `${engine.getFps().toFixed(0)} fps, CPU frame ${instrumentation.frameTimeCounter.lastSecAverage.toFixed(2)} ms, ${instrumentation.drawCallsCounter.current} draw calls${measured ? `\n${measured}` : ""}`;
        }
    };
    window.addEventListener("resize", () => engine.resize());
    renderPanel();
    await scene.whenReadyAsync();
    engine.runRenderLoop(render);
    status.textContent = "";

    window.__ROCK_EXAMPLE__ = {
        ready: true,
        scene,
        setPreset: async (name) => {
            applyPreset(name);
            renderPanel();
            await scene.whenReadyAsync();
        },
        setSettings: updateSettings,
        settings: () => createRockSettings(settings),
        setRockEnabled: async (enabled) => {
            rock.plugin.isEnabled = enabled;
            renderPanel();
            await scene.whenReadyAsync();
        },
        orbit: (radians) => {
            camera.alpha += radians;
        },
        measure: measureBoth,
    };
}

run().catch((error: unknown) => {
    const status = document.getElementById("status");
    if (status) status.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
});
