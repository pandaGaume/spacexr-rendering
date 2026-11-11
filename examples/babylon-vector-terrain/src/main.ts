import "./style.css";
import { createGeospatialRendererEngine, createGeospatialScene, TERRAIN_CONFIG } from "@spacexr/3d-tiles-babylon";
import { createEarthRuntime, EARTH_SYSTEM, type IEarthRuntime } from "@spacexr/babylon-earth";
import { WebMercatorTileMetrics, type ITileAddress } from "@spacexr/tiles";
import { ShapeCollection } from "@spacexr/vector";
import { VectorRasterSource } from "@spacexr/vector/browser";
import { DemPyramid, ChildHeightRanges, WorkerDemDecoder, webDemTileLoader, type IDemWorkerEndpoint } from "@spacexr/dem";
import { createMapzenTerrariumSource } from "../../babylon-implicit-grid-mapzen/src/providers/mapzen";
import DemDecoderWorker from "../../babylon-earth/src/dem-decoder.worker?worker";
import { layers, style } from "./fixtures";

declare global {
    interface Window {
        vectorTerrainDemo?: { earth: IEarthRuntime; vectors: VectorRasterSource; collection: ShapeCollection; frames: number; errors: string[]; dispose(): Promise<void> };
    }
}
const status = document.querySelector<HTMLOutputElement>("#status")!;
const errors: string[] = [];
function report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    status.value = message;
    console.error(error);
}

async function start(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>("#terrain")!;
    const { engine } = await createGeospatialRendererEngine(canvas, "webgpu", { webgpu: { adaptToDeviceRatio: false } });
    const scene = createGeospatialScene(engine);
    const decoder = new WorkerDemDecoder(Array.from({ length: 2 }, () => new DemDecoderWorker() as unknown as IDemWorkerEndpoint));
    let earth: IEarthRuntime | undefined,
        stopped = false,
        frameId = 0;
    const resize = () => engine.resize();
    const dispose = async () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", resize);
        await earth?.dispose();
        decoder.terminate();
        scene.dispose();
        engine.dispose();
    };
    try {
        const metrics = new WebMercatorTileMetrics({ minLOD: 0, maxLOD: 16, tileSize: 256 }, EARTH_SYSTEM);
        const collection = new ShapeCollection(metrics, layers, { tolerancePixels: 2 });
        const vectors = new VectorRasterSource({ collection, style, styleLOD: 12, cacheEntries: 256 });
        const warm: ITileAddress[] = [];
        for (const lod of [11, 12, 13]) {
            const center = metrics.getLatLonToTileXY(45.8326, 6.8652, lod);
            for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) warm.push({ lod, x: center.x + x, y: center.y + y });
        }
        await vectors.precompute(warm);
        const mapzen = createMapzenTerrariumSource({ geodeticSystem: EARTH_SYSTEM }),
            ranges = new ChildHeightRanges();
        const dem = new DemPyramid({
            load: webDemTileLoader(mapzen, decoder),
            maxLOD: mapzen.source.metrics.maxLOD,
            registration: mapzen.source.registration,
            wrapX: true,
            cacheEntries: TERRAIN_CONFIG.dem.cacheEntries,
            abortDelayMilliseconds: TERRAIN_CONFIG.dem.abortDelayMilliseconds,
            generation: { maxLOD: mapzen.source.metrics.maxLOD + TERRAIN_CONFIG.dem.generatedLevels, interpolation: TERRAIN_CONFIG.dem.interpolation },
            childHeightRanges: ranges,
        });
        earth = await createEarthRuntime(scene, {
            date: new Date("2026-06-21T12:00:00Z"),
            atmosphere: false,
            polarCaps: false,
            camera: {
                target: { latitudeDegrees: 45.8326, longitudeDegrees: 6.8652, heightMeters: 3000 },
                radius: 45000,
                pitchRadians: Math.PI / 3,
                attachControl: true,
                radiusMin: 100,
            },
            terrain: {
                cells: TERRAIN_CONFIG.grid.cells,
                minLOD: TERRAIN_CONFIG.mercator.minLOD,
                maxLOD: 16,
                screenSpaceError: 20,
                elevation: { pyramid: dem },
                preparedHeights: { ranges, verticalScale: () => 1 },
                imagery: { load: vectors.load, tileSize: 256, maxLOD: vectors.maxLOD, registration: vectors.registration, wrapX: true, cacheEntries: 256 },
            },
            onError: report,
        });
        const runtime = earth;
        window.vectorTerrainDemo = { earth: runtime, vectors, collection, frames: 0, errors, dispose };
        window.addEventListener("resize", resize);
        window.addEventListener(
            "pagehide",
            () => {
                void dispose();
            },
            { once: true }
        );
        let telemetry = 0;
        const frame = async () => {
            if (stopped) return;
            try {
                await runtime.update();
                if (stopped) return;
                engine.beginFrame();
                scene.render(false);
                engine.endFrame();
                window.vectorTerrainDemo!.frames++;
                if (performance.now() - telemetry > 500) {
                    telemetry = performance.now();
                    status.value = `${Math.round(engine.getFps())} FPS | ${runtime.terrain.getStatistics().presented} tuiles | ${collection.preparedLevels} variantes LOD | ${vectors.tiles.size} tuiles RGBA en cache`;
                }
                frameId = requestAnimationFrame(() => {
                    void frame();
                });
            } catch (error) {
                report(error);
            }
        };
        frameId = requestAnimationFrame(() => {
            void frame();
        });
    } catch (error) {
        await dispose();
        throw error;
    }
}
void start().catch(report);
