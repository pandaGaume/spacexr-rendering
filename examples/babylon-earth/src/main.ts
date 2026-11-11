import "./style.css";
import { createGeospatialRendererEngine, createGeospatialScene, TERRAIN_CONFIG } from "@spacexr/3d-tiles-babylon";
import { createEarthRuntime, EARTH_SYSTEM, earthSunDirection, type IEarthRuntime } from "@spacexr/babylon-earth";
import type { GeospatialCamera } from "@babylonjs/core/Cameras/geospatialCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DemPyramid, ChildHeightRanges, WorkerDemDecoder, type IDemWorkerEndpoint, webDemTileLoader } from "@spacexr/dem";
import { createMapzenTerrariumSource } from "../../babylon-implicit-grid-mapzen/src/providers/mapzen";
import DemDecoderWorker from "./dem-decoder.worker?worker";
import { loadLocalImagery } from "../../babylon-implicit-grid-mapzen/src/local-imagery";

declare global {
    interface Window {
        earthDemo?: {
            earth: IEarthRuntime;
            errors: string[];
            frames: number;
            dispose(): Promise<void>;
        };
    }
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element<HTMLParagraphElement>("status");
const errors: string[] = [];
function report(error: unknown): void {
    const text = error instanceof Error ? error.message : String(error);
    errors.push(text);
    status.textContent = text;
    document.body.dataset.error = "true";
    console.error(error);
}

export type EarthDemoView = "orbit" | "atmosphere";

async function run(initialView: EarthDemoView): Promise<void> {
    const query = new URLSearchParams(location.search),
        withAtmosphere = query.get("atmosphere") !== "0";
    const canvas = element<HTMLCanvasElement>("earth");
    const dpr = Number(query.get("dpr") ?? 1);
    if (!Number.isFinite(dpr) || dpr < 0.5 || dpr > 2) throw new RangeError("dpr must be between 0.5 and 2.");
    const { engine, renderer } = await createGeospatialRendererEngine(canvas, query.get("renderer") === "webgl" ? "webgl" : "webgpu", {
        webgpu: { adaptToDeviceRatio: false },
        webgl: { adaptToDeviceRatio: false },
    });
    engine.setHardwareScalingLevel(1 / dpr);
    const scene = createGeospatialScene(engine);
    let earth: IEarthRuntime | undefined;
    let decoder: WorkerDemDecoder | undefined;
    try {
        const inside =
            query.get("view") === "terrain" ||
            query.get("view") === "atmosphere" ||
            (initialView === "atmosphere" && query.get("view") !== "orbit");
        const demEnabled = query.get("dem") !== "0";
        if (demEnabled)
            decoder = new WorkerDemDecoder(
                Array.from(
                    { length: Math.max(1, Math.min(2, navigator.hardwareConcurrency ?? 2)) },
                    () => new DemDecoderWorker() as unknown as IDemWorkerEndpoint,
                ),
            );
        const mapzen = demEnabled ? createMapzenTerrariumSource({ geodeticSystem: EARTH_SYSTEM }) : undefined;
        const childHeightRanges = new ChildHeightRanges();
        const dem = mapzen
            ? new DemPyramid({
                  load: webDemTileLoader(mapzen, decoder!),
                  maxLOD: mapzen.source.metrics.maxLOD,
                  registration: mapzen.source.registration,
                  wrapX: true,
                  cacheEntries: TERRAIN_CONFIG.dem.cacheEntries,
                  abortDelayMilliseconds: TERRAIN_CONFIG.dem.abortDelayMilliseconds,
                  generation: {
                      maxLOD: mapzen.source.metrics.maxLOD + TERRAIN_CONFIG.dem.generatedLevels,
                      interpolation: TERRAIN_CONFIG.dem.interpolation,
                  },
                  childHeightRanges,
              })
            : undefined;
        const imageryName = query.get("imagery") ?? "google";
        const imagerySource = imageryName === "none" ? undefined : await loadLocalImagery(imageryName);
        const imagery = imagerySource
            ? {
                  load: imagerySource.load,
                  registration: imagerySource.registration,
                  maxLOD: imagerySource.maxLOD,
                  tileSize: TERRAIN_CONFIG.imagery.tileCells,
                  wrapX: true,
                  cacheEntries: TERRAIN_CONFIG.imagery.contentCacheEntries,
              }
            : undefined;
        const sse = Number(query.get("sse") ?? 20);
        const terrainView = inside;
        const horizonView = query.get("view") === "horizon";
        const initialHour = Number(query.get("hour") ?? 12);
        if (!Number.isFinite(initialHour) || initialHour < 0 || initialHour > 24)
            throw new RangeError("hour must be between 0 and 24 UTC.");
        const initialDate = new Date(Date.UTC(2026, 5, 21) + initialHour * 3600000);
        document.querySelector("h1")!.textContent = inside ? "Dans l’atmosphère" : "Terre depuis l’orbite";
        earth = await createEarthRuntime(scene, {
            date: initialDate,
            atmosphere: withAtmosphere ? { aerialPerspective: query.get("aerial") !== "0" } : false,
            camera: {
                target: terrainView
                    ? {
                          latitudeDegrees: 45.8326,
                          longitudeDegrees: 6.8652,
                          heightMeters: dem ? 4808 : 0,
                      }
                    : horizonView
                      ? { latitudeDegrees: 45, longitudeDegrees: 5 }
                      : { latitudeDegrees: 25, longitudeDegrees: 0 },
                radius: terrainView ? 35000 : horizonView ? 1800000 : 12000000,
                pitchRadians: terrainView ? (80 * Math.PI) / 180 : horizonView ? (85 * Math.PI) / 180 : 0,
                yawRadians: horizonView ? 1.1 : 0,
                attachControl: true,
                radiusMin: 100,
            },
            terrain: {
                cells: TERRAIN_CONFIG.grid.cells,
                minLOD: TERRAIN_CONFIG.mercator.minLOD,
                maxLOD: TERRAIN_CONFIG.mercator.maxLOD,
                screenSpaceError: sse,
                ...(imagery ? { imagery } : {}),
                ...(dem ? { elevation: { pyramid: dem }, preparedHeights: { ranges: childHeightRanges, verticalScale: () => 1 } } : {}),
            },
            onError: report,
        });
        const runtime = earth;
        const camera = runtime.camera as GeospatialCamera;
        const view = (latitude: number, longitude: number, height: number, radius: number, pitch: number): void => {
            const p = EARTH_SYSTEM.geodeticDegreesToEcef(latitude, longitude, height);
            camera.center = new Vector3(p.x, p.y, p.z);
            camera.radius = radius;
            camera.pitch = pitch;
        };
        element<HTMLButtonElement>("orbit").onclick = () => view(25, 0, 0, 12000000, 0);
        element<HTMLButtonElement>("horizon").onclick = () => {
            if (inside) {
                location.href = "/orbital.html?view=horizon&sse=" + sse;
                return;
            }
            view(45, 5, 0, 1800000, (85 * Math.PI) / 180);
            camera.yaw = 1.1;
        };
        element<HTMLButtonElement>("terrain").onclick = () => {
            if (!demEnabled) {
                query.set("view", "terrain");
                query.set("dem", "1");
                location.search = query.toString();
                return;
            }
            view(45.8326, 6.8652, 4808, 35000, (80 * Math.PI) / 180);
        };
        const atmosphere = element<HTMLInputElement>("atmosphere");
        atmosphere.checked = withAtmosphere;
        atmosphere.disabled = !withAtmosphere;
        const showAtmosphereState = () => {
            element<HTMLOutputElement>("atmosphere-state").value = atmosphere.checked ? "ON" : "OFF";
        };
        showAtmosphereState();
        atmosphere.onchange = () => {
            runtime.setAtmosphereEnabled(atmosphere.checked);
            showAtmosphereState();
        };
        element<HTMLInputElement>("exposure").oninput = (event) => runtime.setExposure(Number((event.target as HTMLInputElement).value));
        const hour = element<HTMLInputElement>("hour");
        const dateAt = (hours: number) => new Date(Date.UTC(2026, 5, 21) + hours * 3600000);
        const showTime = (date: Date) => {
            hour.value = String(date.getUTCHours() + date.getUTCMinutes() / 60);
            element<HTMLOutputElement>("time").value = date.toISOString().slice(11, 16);
        };
        showTime(initialDate);
        hour.oninput = () => showTime(dateAt(Number(hour.value)));
        hour.onchange = () => {
            status.textContent = "Actualisation de la lumière...";
            void runtime.setDate(dateAt(Number(hour.value))).catch(report);
        };
        const sunset = async (): Promise<void> => {
            if (!inside && camera.radius > 3000000) view(45, 5, 0, 1800000, (85 * Math.PI) / 180);
            let date = dateAt(19);
            for (let iteration = 0; iteration < 3; iteration++) {
                camera.pitch = (85 * Math.PI) / 180;
                camera.update();
                camera.getViewMatrix(true);
                const geo = EARTH_SYSTEM.ecefToGeodeticRadians(camera.globalPosition);
                const local = EARTH_SYSTEM.createLocalTangentPlaneDegrees(
                    (geo.latitude * 180) / Math.PI,
                    (geo.longitude * 180) / Math.PI,
                ).basis;
                const horizon = -Math.acos(
                    EARTH_SYSTEM.ellipsoid.semiMajorAxis / (EARTH_SYSTEM.ellipsoid.semiMajorAxis + Math.max(1, geo.height)),
                );
                let low = 12,
                    high = 24;
                for (let n = 0; n < 32; n++) {
                    const middle = (low + high) / 2,
                        sun = earthSunDirection(dateAt(middle));
                    const elevation = Math.asin(sun[0] * local.up.x + sun[1] * local.up.y + sun[2] * local.up.z);
                    if (elevation > horizon + ((inside ? 1.25 : 3) * Math.PI) / 180) low = middle;
                    else high = middle;
                }
                date = dateAt((low + high) / 2);
                const sun = Vector3.FromArray(earthSunDirection(date));
                camera.yaw = Math.atan2(
                    sun.x * local.east.x + sun.y * local.east.y + sun.z * local.east.z,
                    sun.x * local.north.x + sun.y * local.north.y + sun.z * local.north.z,
                );
            }
            showTime(date);
            status.textContent = "Préparation du coucher de soleil...";
            await runtime.setDate(date);
        };
        element<HTMLButtonElement>("sunset").onclick = () => {
            void sunset().catch(report);
        };
        if (query.get("sunset") === "1") await sunset();
        element<HTMLElement>("attribution").textContent = [
            demEnabled ? "Relief Mapzen Terrain Tiles (Terrarium), AWS Open Data. Normales issues du DEM." : "Surface ellipsoïdale.",
            imagerySource?.attribution,
        ]
            .filter(Boolean)
            .join(" | ");
        let stopped = false,
            frameId = 0;
        const resize = () => engine.resize();
        window.addEventListener("resize", resize);
        const dispose = async () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(frameId);
            window.removeEventListener("resize", resize);
            await runtime.dispose();
            decoder?.terminate();
            scene.dispose();
            engine.dispose();
        };
        window.earthDemo = { earth: runtime, errors, frames: 0, dispose };
        window.addEventListener(
            "pagehide",
            () => {
                void dispose();
            },
            { once: true },
        );
        let lastTelemetry = 0;
        const frame = async (): Promise<void> => {
            if (stopped) return;
            try {
                await runtime.update();
                if (stopped) return;
                engine.beginFrame();
                scene.render(false);
                engine.endFrame();
                window.earthDemo!.frames++;
                const now = performance.now();
                // Collecting the runtime snapshot traverses its nodes. Keep telemetry out of the per-frame hot path.
                if (now - lastTelemetry >= 250) {
                    lastTelemetry = now;
                    element<HTMLOutputElement>("fps").value = `${Math.round(engine.getFps())} FPS`;
                    const resources = runtime.terrain.getStatistics();
                    const pending = runtime.runtime.instrumentation.snapshot().pendingLoads;
                    element<HTMLElement>("stats").textContent =
                        `${renderer} | SSE ${sse} px | ${resources.presented} tuiles implicites | ${Math.round(engine.getFps())} FPS`;
                    if (!errors.length)
                        status.textContent =
                            withAtmosphere && atmosphere.checked
                                ? runtime.atmosphereReady
                                    ? pending > 0
                                        ? `Chargement du relief : ${pending} tâches restantes`
                                        : "Terre et atmosphère spectrale actives"
                                    : "Construction progressive du ciel..."
                                : "Terre active, atmosphère désactivée";
                }
            } catch (error) {
                report(error);
                return;
            }
            frameId = requestAnimationFrame(() => {
                void frame();
            });
        };
        frameId = requestAnimationFrame(() => {
            void frame();
        });
    } catch (error) {
        await earth?.dispose();
        decoder?.terminate();
        scene.dispose();
        engine.dispose();
        throw error;
    }
}
export function startEarthDemo(view: EarthDemoView): void {
    void run(view).catch(report);
}
