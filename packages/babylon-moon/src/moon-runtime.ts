import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
    BabylonRasterPages,
    BabylonRasterTileAdapter,
    BabylonRuntimeDriver,
    GpuTerrainEngine,
    MotionRefinementScale,
    OrbitalCamera,
    TERRAIN_CONFIG,
    type IBabylonRasterPage,
    type ITerrainEngine,
} from "@spacexr/3d-tiles-babylon";
import {
    DenseImplicitSubtreeLoader,
    EcefSpatialMetric,
    TileRuntime,
    VerticalScale,
    type IEcefCameraFrame,
    type IEcefSpatialState,
    type IRuntimeAdapter,
} from "@spacexr/3d-tiles-runtime";
import type { ChildHeightRanges, DemPyramid } from "@spacexr/dem";
import { Ellipsoid, GeodeticSystem } from "@spacexr/geodesy";
import type { IRasterGrid } from "@spacexr/raster";
import { createCubeGridSource, cubeTiling, metadataTileAddress } from "@spacexr/terrain-tileset";
import { CUBE_TILE_TOPOLOGY, planetocentricDirection, type CubeTileSurface, type ICartesian3, type ITileAddress } from "@spacexr/tiles";

import { MOON_CONFIG } from "./moon-config";

/** Elevation of the body: a DEM on the cube index and its heights for the camera. */
export interface IMoonElevation {
    pyramid: DemPyramid;
    /** Ranges the DEM prepares for the children of each tile it loads, shared with the terrain quadtree. */
    childHeightRanges: ChildHeightRanges;
    /** Deepest level of the DEM anywhere on the body. */
    deepestLOD: number;
    /** Height over the reference surface in a direction, synchronous, `NaN` until a tile covers it. */
    heightAt: (direction: Readonly<ICartesian3>) => number;
}

/** Imagery of the body, tiles on the cube index. */
export interface IMoonImagery {
    load: (address: ITileAddress, signal?: AbortSignal) => Promise<IRasterGrid<Uint8Array | Uint8ClampedArray> | undefined>;
    maxLOD: number;
    /** `point` for tiles that hold their shared edges, as those of a tile service. */
    registration: "point" | "area";
    attribution?: string;
}

/** What the composition draws: a reference surface on the cube index, its elevation and its imagery. */
export interface IMoonBody {
    /** Name of the body, for messages. */
    name: string;
    surface: CubeTileSurface;
    elevation?: IMoonElevation;
    imagery?: IMoonImagery;
}

export type MoonTileRuntime = TileRuntime<IEcefCameraFrame, IEcefSpatialState, unknown, never>;

export interface IMoonRuntimeOptions {
    body: IMoonBody;
    /** Browser DOM layer for optional tile labels. An owned hidden layer is created when omitted. */
    labelLayer?: HTMLElement;
    camera?: {
        /** Planetocentric latitude and longitude of the point the camera orbits, in degrees. */
        latitude?: number;
        longitude?: number;
        /** Distance to that point, in metres. */
        radius?: number;
        pitchRadians?: number;
        headingRadians?: number;
        attachControl?: boolean;
    };
    terrain?: {
        /** Cells per side of a terrain grid. Defaults to those of `terrain-config.json`. */
        cells?: number;
        screenSpaceError?: number;
        wireframe?: boolean;
        lighting?: "terrain" | "ambient";
    };
    /** Scale shared by every height of the scene. One is created when omitted. */
    verticalScale?: VerticalScale;
    /** New detail waits while the camera moves fast. Defaults to true. */
    motionRefinement?: boolean;
    onError?: (error: unknown) => void;
}

export interface IMoonRuntime {
    readonly body: IMoonBody;
    /** Geodetic system of the horizon test: the sphere of the smallest radius, which lies below the surface. */
    readonly geodeticSystem: GeodeticSystem;
    readonly camera: OrbitalCamera;
    readonly runtime: MoonTileRuntime;
    readonly imageryRuntime: TileRuntime<IEcefCameraFrame, IEcefSpatialState, IBabylonRasterPage, never> | undefined;
    readonly terrain: ITerrainEngine;
    readonly verticalScale: VerticalScale;
    /** Spatial metric of the terrain, whose projection fallback view displays read. */
    readonly spatial: EcefSpatialMetric;
    /** Deepest level of the terrain quadtree. */
    readonly maxLOD: number;
    /** Call before `scene.render()`: publishes the selection and the junctions of this frame. */
    beforeRender(): void;
    /** Call after `scene.render()`. */
    afterRender(): void;
    /** Disposes owned resources, preserving the borrowed scene and engine. */
    dispose(): Promise<void>;
}

/**
 * Composes a body on the cube index in a Babylon scene: one terrain TileRuntime on the six faces, poles included, the GPU
 * terrain engine with radial heights, an imagery runtime when the body has imagery, a camera orbiting across the poles,
 * and a Sun. The caller keeps its render loop: call `beforeRender`, `scene.render()`, then `afterRender`.
 */
export async function createMoonRuntime(scene: Scene, options: IMoonRuntimeOptions): Promise<IMoonRuntime> {
    if (!scene.useRightHandedSystem) throw new Error("The Moon runtime requires a right-handed ECEF scene. Use createGeospatialScene.");
    const { body } = options;
    const surface = body.surface;
    const radii = surface.reference.radii;
    const geodeticSystem = new GeodeticSystem(Ellipsoid.sphere(body.name, Math.min(radii[0], radii[1], radii[2])));
    const cells = options.terrain?.cells ?? TERRAIN_CONFIG.grid.cells;
    if (![4, 8, 16, 32, 64, 128, 256].includes(cells)) throw new RangeError("Terrain cells must be a power of 2 from 4 to 256.");
    // With fewer cells per side in a terrain tile than in a DEM tile, the terrain reaches the samples of the DEM levels
    // below it: the grid goes as deep as the data anywhere, on every face, so that neighbours always connect.
    const maxLOD = (body.elevation?.deepestLOD ?? 0) + Math.log2(TERRAIN_CONFIG.dem.tileCells / cells);
    const verticalScale = options.verticalScale ?? new VerticalScale(1);
    const elevation = body.elevation;
    const preparedHeights = elevation ? { ranges: elevation.childHeightRanges, verticalScale: () => verticalScale.value } : undefined;
    // On a sphere with terrain below its reference surface, the horizon reads the heights of each tile.
    const spatialOptions = { geodeticSystem, horizon: "tile-heights" as const };
    const selection = TERRAIN_CONFIG.selection;
    const cache = { workingSetFactor: MOON_CONFIG.selection.workingSetFactor };

    let ownedLabels: HTMLElement | undefined;
    let camera: OrbitalCamera | undefined;
    let sun: DirectionalLight | undefined;
    let sky: HemisphericLight | undefined;
    let imageryPages: BabylonRasterPages | undefined;
    let terrain: ITerrainEngine | undefined;
    let runtime: MoonTileRuntime | undefined;
    let imageryRuntime: TileRuntime<IEcefCameraFrame, IEcefSpatialState, IBabylonRasterPage, never> | undefined;
    let driver: BabylonRuntimeDriver | undefined;
    let imageryDriver: BabylonRuntimeDriver | undefined;
    let disposed = false;
    const dispose = async (): Promise<void> => {
        if (disposed) return;
        disposed = true;
        driver?.dispose();
        imageryDriver?.dispose();
        await runtime?.dispose();
        await imageryRuntime?.dispose();
        // The engine releases its imagery bindings before the pages they read.
        terrain?.dispose();
        imageryPages?.dispose();
        sun?.dispose();
        sky?.dispose();
        camera?.dispose();
        ownedLabels?.remove();
    };
    try {
        const latitude = options.camera?.latitude ?? 0;
        const longitude = options.camera?.longitude ?? 0;
        camera = new OrbitalCamera(scene, {
            name: "moon-camera",
            surface: surface.reference,
            direction: planetocentricDirection(latitude, longitude),
            radius: options.camera?.radius ?? 400000,
            pitchRadians: options.camera?.pitchRadians ?? 0,
            headingRadians: options.camera?.headingRadians ?? 0,
            radiusMin: MOON_CONFIG.camera.radiusMin,
            altitudeMin: MOON_CONFIG.camera.altitudeMin,
            ...(elevation ? { heightAt: elevation.heightAt, verticalScale } : {}),
            ...(options.camera?.attachControl !== undefined ? { attachControl: options.camera.attachControl } : {}),
        });
        scene.activeCamera = camera;

        // Sun from the north-west, 45 degrees above the horizon of the target.
        const lighting = options.terrain?.lighting ?? "terrain";
        const { east, north, up } = geodeticSystem.createLocalTangentPlaneDegrees(latitude, longitude).basis;
        const toSun = new Vector3(
            up.x + (north.x - east.x) * Math.SQRT1_2,
            up.y + (north.y - east.y) * Math.SQRT1_2,
            up.z + (north.z - east.z) * Math.SQRT1_2,
        ).normalize();
        sun = new DirectionalLight("moon-sun", toSun.negate(), scene);
        sun.intensity = lighting === "ambient" ? 0 : 1.1;
        sky = new HemisphericLight("moon-sky", new Vector3(up.x, up.y, up.z), scene);
        sky.intensity = lighting === "ambient" ? 1 : 0.25;
        sky.groundColor = lighting === "ambient" ? Color3.White() : new Color3(0.1, 0.1, 0.12);

        if (!options.labelLayer) {
            if (typeof document === "undefined") throw new Error("Pass labelLayer when creating the Moon runtime outside a browser.");
            ownedLabels = document.createElement("div");
            ownedLabels.hidden = true;
        }
        imageryPages = body.imagery
            ? new BabylonRasterPages(scene, {
                  load: body.imagery.load,
                  maxLOD: body.imagery.maxLOD,
                  registration: body.imagery.registration,
                  tileSize: TERRAIN_CONFIG.imagery.tileCells,
              })
            : undefined;
        terrain = new GpuTerrainEngine(
            {
                scene,
                labelLayer: options.labelLayer ?? ownedLabels!,
                wireframe: options.terrain?.wireframe ?? false,
                lighting,
                junctions: "fine",
                edgeHeights: "coarsest",
                // One instance per presented tile and its junction topology; the shader computes the cube surface.
                geometrySelection: "runtime",
                tiling: cubeTiling(surface),
                ...(elevation ? { elevation: { pyramid: elevation.pyramid, verticalScale } } : {}),
                ...(imageryPages ? { imageryPages } : {}),
            },
            { cells },
        );

        const source = createCubeGridSource(surface, preparedHeights, { maxLOD, tileSize: cells });
        const spatial = new EcefSpatialMetric(spatialOptions);
        const adapter: IRuntimeAdapter<IEcefCameraFrame, IEcefSpatialState, unknown, never> = {
            tilesets: { load: async () => ({ tileset: source.tileset }) },
            subtrees: new DenseImplicitSubtreeLoader(),
            implicitTiles: source.resolver,
            spatial,
            activation: terrain,
            presentation: terrain,
        };
        const motionScale = options.motionRefinement === false ? undefined : new MotionRefinementScale(TERRAIN_CONFIG.motion);
        runtime = new TileRuntime({
            id: "moon-terrain",
            selectionStrategy: "active",
            uri: "memory://moon-terrain/tileset.json",
            adapter,
            maxScreenSpaceError: options.terrain?.screenSpaceError ?? selection.screenSpaceError,
            refinementHysteresisRatio: selection.hysteresis,
            ...(motionScale ? { refinementThresholdScale: () => motionScale.scale } : {}),
            coarseningDelayMilliseconds: selection.coarseningDelayMilliseconds,
            maxConcurrentLoads: selection.maxConcurrentLoads,
            instrumentation: { enabled: true },
            // Neighbouring tiles stay within one level across the faces of the cube, so that every edge junction connects.
            quadtreeBalance: { topology: CUBE_TILE_TOPOLOGY },
            verticalScale,
            cache: { maxContentEntries: selection.contentCacheEntries, ...cache },
        });
        if (options.onError)
            runtime.events.subscribe((event) => {
                if (event.type === "error") options.onError!(event.error);
            });

        if (imageryPages && body.imagery) {
            // Imagery is a second quadtree on the cube, refined on texel size; it shares the height ranges of the DEM.
            const imagerySource = createCubeGridSource(surface, preparedHeights, {
                maxLOD: body.imagery.maxLOD,
                tileSize: TERRAIN_CONFIG.imagery.tileCells,
                id: "imagery",
            });
            const imageryAdapter = new BabylonRasterTileAdapter<IEcefSpatialState>(imageryPages, {
                addressOf: (context) => metadataTileAddress(context.tile),
            });
            imageryRuntime = new TileRuntime({
                id: "moon-imagery",
                selectionStrategy: "active",
                uri: "memory://moon-imagery/tileset.json",
                adapter: {
                    tilesets: { load: async () => ({ tileset: imagerySource.tileset }) },
                    subtrees: new DenseImplicitSubtreeLoader(),
                    implicitTiles: imagerySource.resolver,
                    spatial: new EcefSpatialMetric(spatialOptions),
                    activation: imageryAdapter,
                    presentation: imageryAdapter,
                },
                // The geometric error of an imagery tile is one texel.
                maxScreenSpaceError: TERRAIN_CONFIG.imagery.screenSpaceError,
                refinementHysteresisRatio: selection.hysteresis,
                coarseningDelayMilliseconds: selection.coarseningDelayMilliseconds,
                maxConcurrentLoads: selection.maxConcurrentLoads,
                verticalScale,
                // Each imagery page holds a texture array layer: these pages bound the GPU memory.
                cache: { maxContentEntries: TERRAIN_CONFIG.imagery.contentCacheEntries, ...cache },
            });
        }

        const orbital = camera;
        // The periphery of the view loads ahead of the camera, at every depth.
        const frustumMargin = selection.frustumMargin;
        driver = new BabylonRuntimeDriver(runtime, scene, {
            camera,
            frustumMargin,
            ...(motionScale ? { motion: { scale: motionScale, surfaceDistance: () => orbital.frame.radius } } : {}),
            ...(options.onError ? { onError: options.onError } : {}),
        });
        imageryDriver = imageryRuntime
            ? new BabylonRuntimeDriver(imageryRuntime, scene, {
                  camera,
                  frustumMargin,
                  ...(options.onError ? { onError: options.onError } : {}),
              })
            : undefined;
        await Promise.all([driver.start(), imageryDriver?.start()]);

        const engine = terrain;
        return {
            body,
            geodeticSystem,
            camera,
            runtime,
            imageryRuntime,
            terrain,
            verticalScale,
            spatial,
            maxLOD,
            beforeRender: () => engine.beforeRender(),
            afterRender: () => engine.afterRender(),
            dispose,
        };
    } catch (error) {
        await dispose();
        throw error;
    }
}
