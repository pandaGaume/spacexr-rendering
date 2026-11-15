import "../../babylon-implicit-grid-mapzen/src/style.css";

import {
    BabylonRuntimeMonitor,
    TERRAIN_CONFIG,
    createEcefCameraFrame,
    createGeospatialRendererEngine,
    createGeospatialScene,
} from "@spacexr/3d-tiles-babylon";
import { VerticalScale, describeView, radialVerticalFrame, type ITileAddress } from "@spacexr/3d-tiles-runtime";
import { createMarsRuntime, loadMarsBody, type IMarsBody, type IMarsImagery } from "@spacexr/babylon-mars";
import { WorkerDemDecoder, type IDemWorkerEndpoint } from "@spacexr/dem";

import { debugImageryTile } from "../../babylon-implicit-grid-mapzen/src/debug-imagery";
import { clearMonitorPanel, renderMonitorPanel } from "../../babylon-implicit-grid-mapzen/src/monitor-panel";
import { ViewHud } from "../../shared/view-hud/view-hud";
import DemDecoderWorker from "./dem-decoder.worker?worker";

function requiredElement<T extends HTMLElement>(id: string, type: new () => T): T {
    const element = document.getElementById(id);
    if (!(element instanceof type)) throw new Error(`Missing element #${id}.`);
    return element;
}

/** Imagery drawn locally, without network: a checkerboard tinted by level, on the samples of the cube. */
const DEBUG_IMAGERY: IMarsImagery = {
    // Cube tiles hold their shared edges: one more texel per side.
    load: (address: ITileAddress) => Promise.resolve(debugImageryTile(address, TERRAIN_CONFIG.imagery.tileCells + 1)),
    maxLOD: TERRAIN_CONFIG.imagery.maxLOD,
    registration: "point",
};

async function run(): Promise<void> {
    const startedAt = performance.now();
    const canvas = requiredElement("render-canvas", HTMLCanvasElement);
    const status = requiredElement("runtime-status", HTMLSpanElement);
    const panel = {
        tiles: requiredElement("runtime-statistics", HTMLSpanElement),
        memory: requiredElement("memory-statistics", HTMLSpanElement),
        cleanup: requiredElement("cleanup-statistics", HTMLSpanElement),
        renderer: requiredElement("renderer-statistics", HTMLSpanElement),
        frame: requiredElement("frame-statistics", HTMLSpanElement),
    };
    const parameters = new URLSearchParams(window.location.search);
    // `dataset` names the folder of a revision of a tile service, which holds its descriptors.
    const service = parameters.get("dataset");
    if (!service) throw new RangeError("Give the folder of a Mars revision of a tile service with ?dataset=.");
    // `renderer=webgpu` runs the WGSL shaders on the WebGPU engine of Babylon where the browser supports it.
    const antialias = parameters.get("antialias") !== "0";
    const { engine, renderer } = await createGeospatialRendererEngine(
        canvas,
        parameters.get("renderer") === "webgpu" ? "webgpu" : "webgl",
        { webgl: { antialias }, webgpu: { antialias } },
    );
    const scene = createGeospatialScene(engine);

    status.textContent = "Reading the dataset...";
    const decoder = new WorkerDemDecoder(
        Array.from(
            { length: Math.max(1, Math.min(4, navigator.hardwareConcurrency ?? 2)) },
            () => new DemDecoderWorker() as unknown as IDemWorkerEndpoint,
        ),
    );
    const loaded = await loadMarsBody(service, decoder, {
        cacheEntries: Number(parameters.get("demCache") ?? TERRAIN_CONFIG.dem.cacheEntries),
        abortDelayMilliseconds: Number(parameters.get("demAbortDelay") ?? TERRAIN_CONFIG.dem.abortDelayMilliseconds),
    });
    // `imagery`: `dataset` reads the imagery of the tile service, the default when it publishes one; `debug` draws pages
    // locally; `none` shades the relief alone.
    const imagery = parameters.get("imagery") ?? (loaded.imagery ? "dataset" : "none");
    if (!["dataset", "debug", "none"].includes(imagery)) throw new RangeError("imagery must be dataset, debug or none.");
    if (imagery === "dataset" && !loaded.imagery) throw new RangeError("imagery=dataset needs a dataset that publishes imagery.json.");
    const solid = parameters.get("solid") !== "0";
    const { imagery: datasetImagery, ...withoutImagery } = loaded;
    const body: IMarsBody =
        !solid || imagery === "none"
            ? withoutImagery
            : imagery === "debug"
              ? { ...withoutImagery, imagery: DEBUG_IMAGERY }
              : { ...withoutImagery, imagery: datasetImagery! };
    if (parameters.get("elevation") === "0") delete body.elevation;

    const scaleInput = requiredElement("vertical-scale", HTMLInputElement);
    const scaleValue = requiredElement("vertical-scale-value", HTMLOutputElement);
    const verticalScale = new VerticalScale(Number(parameters.get("scale") ?? "1"));
    const lighting = parameters.get("lighting") === "ambient" ? "ambient" : "terrain";
    const cells = Number(parameters.get("grid") ?? TERRAIN_CONFIG.grid.cells);
    const screenSpaceError = Number(parameters.get("sse") ?? TERRAIN_CONFIG.selection.screenSpaceError);
    // Jezero crater by default.
    const mars = await createMarsRuntime(scene, {
        body,
        labelLayer: requiredElement("tile-labels", HTMLDivElement),
        camera: {
            latitude: Number(parameters.get("lat") ?? "18.4"),
            longitude: Number(parameters.get("lon") ?? "77.6"),
            radius: Number(parameters.get("radius") ?? "90000"),
            pitchRadians: (Number(parameters.get("pitch") ?? "60") * Math.PI) / 180,
            headingRadians: (Number(parameters.get("yaw") ?? "0") * Math.PI) / 180,
            attachControl: true,
        },
        terrain: { cells, screenSpaceError, wireframe: !solid, lighting },
        verticalScale,
        motionRefinement: parameters.get("motion") !== "0",
        onError: (error) => {
            status.textContent = "Runtime frame failed";
            console.error("Mars runtime frame failed", error);
        },
    });

    scaleInput.value = String(verticalScale.value);
    scaleValue.value = `x${verticalScale.value}`;
    scaleInput.disabled = !body.elevation;
    scaleInput.addEventListener("input", () => {
        verticalScale.set(Number(scaleInput.value));
        scaleValue.value = `x${verticalScale.value}`;
    });
    requiredElement("attribution", HTMLElement).textContent = body.imagery?.attribution ?? "";

    const monitor = new BabylonRuntimeMonitor(engine, scene, mars.runtime.instrumentation, {
        enabled: parameters.get("monitor") !== "0",
        resources: mars.terrain,
    });
    if (monitor.enabled) monitor.subscribe((snapshot) => renderMonitorPanel(panel, snapshot));
    else clearMonitorPanel(panel);
    monitor.setStartupMilliseconds(performance.now() - startedAt);
    const deepest = body.elevation ? `DEM LOD 0..${body.elevation.deepestLOD}, ` : "";
    status.textContent = `${body.name} dataset, ${deepest}cube index, LOD 0..${mars.maxLOD} | ${
        renderer === "webgpu" ? "WebGPU, WGSL" : "WebGL, GLSL"
    }`;

    // Objects of the example, for the probes of the terrain bench and the browser console.
    (window as unknown as Record<string, unknown>).__SPACEXR_EXAMPLE__ = {
        renderer,
        camera: mars.camera,
        runtime: mars.runtime,
        imageryRuntime: mars.imageryRuntime,
        terrain: mars.terrain,
        verticalScale,
        body,
        scene,
    };

    // Scale and altitude of the view. `hud=0` hides them.
    const hud = parameters.get("hud") === "0" ? undefined : new ViewHud(document.body);
    if (hud) {
        const vertical = radialVerticalFrame(body.surface.reference);
        scene.onAfterRenderObservable.add(() => {
            const frame = createEcefCameraFrame(mars.camera, engine);
            const { x, y, z } = frame.position;
            const length = Math.hypot(x, y, z) || 1;
            const height = body.elevation?.heightAt({ x: x / length, y: y / length, z: z / length });
            const view = describeView(frame, {
                vertical,
                fallback: mars.spatial.projectionFallback,
                ...(height !== undefined && !Number.isNaN(height) ? { groundHeight: height * verticalScale.value } : {}),
                // The orbited point is at the centre of the view.
                targetDistance: mars.camera.frame.radius,
            });
            hud.update(view, frame.viewportHeight / (canvas.clientHeight || 1));
        });
    }

    engine.runRenderLoop(() => {
        mars.beforeRender();
        scene.render();
        monitor.update();
        mars.afterRender();
    });
    const resize = (): void => engine.resize();
    window.addEventListener("resize", resize);
    window.addEventListener(
        "beforeunload",
        () => {
            window.removeEventListener("resize", resize);
            hud?.dispose();
            monitor.dispose();
            void mars.dispose();
            decoder.terminate();
            scene.dispose();
            engine.dispose();
        },
        { once: true },
    );
}

void run().catch((error: unknown) => {
    const status = document.getElementById("runtime-status");
    if (status) status.textContent = error instanceof Error ? error.message : "The Mars example could not start.";
    console.error("Babylon Mars example failed", error);
});
