import { TERRAIN_CONFIG } from "@spacexr/3d-tiles-babylon";
import { ChildHeightRanges, cubeDemPyramid, type DemPyramid, type IDemDecoder } from "@spacexr/dem";
import { BrowserImageDecoder, type IImageDecoder, type IRasterGrid } from "@spacexr/raster";
import { CelestialTileSource, cubeFaceCoordinates, cubeTileOfDirection, type ICartesian3, type ITileAddress } from "@spacexr/tiles";

import type { IMoonBody } from "./moon-runtime";

/** Elevation and imagery of a body, from the descriptors of a tile service. */
export interface IMoonDataset {
    elevation: CelestialTileSource;
    /** Imagery of the body, absent when the service publishes none. */
    imagery?: CelestialTileSource;
    /** Radii `a`, `b`, `c` of the reference surface, read from the descriptors, in metres. */
    radii: readonly [number, number, number];
}

/**
 * Reads the descriptor `name.json` of a tile service.
 *
 * @param optional - Whether a missing descriptor, answered 404, reads as absent.
 */
async function loadSource(service: string, name: string, optional = false): Promise<CelestialTileSource | undefined> {
    const url = new URL(`${name}.json`, `${service.replace(/\/+$/, "")}/`);
    const response = await fetch(url);
    if (optional && response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url.href} answered ${response.status}.`);
    const descriptor = (await response.json()) as Record<string, unknown>;
    // A relative template resolves against its descriptor, as a relative URI of 3D Tiles resolves against its tileset:
    // a static bucket serves templates such as `./elevation/{face}/{z}/{x}/{y}.png`.
    const tiles = descriptor.tiles;
    if (typeof tiles === "string" && !/^[a-z][a-z\d+.-]*:/i.test(tiles))
        descriptor.tiles = new URL(tiles, url).href.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
    return new CelestialTileSource(descriptor);
}

/**
 * Reads `elevation.json` and, when the service publishes one, `imagery.json` of a tile service. Their URL templates
 * carry the revision of the dataset, so the descriptors are read at each start and tile URLs are never built by hand.
 * Any reference surface is accepted, a triaxial one included: heights are radial, along the direction from the centre.
 *
 * @throws RangeError When a descriptor holds other content, or when the two do not describe the same surface.
 */
export async function loadMoonDataset(service: string): Promise<IMoonDataset> {
    const [elevation, imagery] = await Promise.all([loadSource(service, "elevation"), loadSource(service, "imagery", true)]);
    if (elevation!.dataset.content !== "elevation") throw new RangeError("elevation.json does not hold elevation.");
    if (imagery && imagery.dataset.content !== "imagery") throw new RangeError("imagery.json does not hold imagery.");
    const radii = elevation!.dataset.referenceRadii;
    if (imagery && imagery.dataset.referenceRadii.some((radius, axis) => radius !== radii[axis]))
        throw new RangeError("The elevation and imagery of a dataset must share their reference surface.");
    return {
        elevation: elevation!,
        ...(imagery ? { imagery } : {}),
        radii: [radii[0], radii[1], radii[2]],
    };
}

/** Loads the imagery tiles of a dataset, which hold their shared edges. */
export function datasetImageryLoader(
    source: CelestialTileSource,
    decoder: IImageDecoder = new BrowserImageDecoder(),
): (address: ITileAddress) => Promise<IRasterGrid<Uint8Array | Uint8ClampedArray> | undefined> {
    return async (address) => {
        const result = await source.fetchTile(address);
        return result.status === "absent" ? undefined : decoder.decode(result.bytes);
    };
}

/** Deepest tiles kept by {@link datasetHeightAt}: the camera asks for the point it orbits and the point below it. */
const FOLLOWED_TILES = 4;

/**
 * Height of the terrain in a direction, for a camera: synchronous, and independent of the tiles on screen, as the point
 * below the camera often is not. It loads and keeps the tile of `demMaxLOD` in the directions asked, which holds every
 * sample of the dataset, and keeps the faces of level 0, which answer while a tile loads.
 *
 * @param demMaxLOD - Deepest level of the dataset, not of the generated levels below it.
 * @returns A function giving metres over the reference surface, `NaN` until a tile covers the direction.
 */
export function datasetHeightAt(pyramid: DemPyramid, demMaxLOD: number): (direction: Readonly<ICartesian3>) => number {
    const load = (address: ITileAddress): void => {
        pyramid.retain(address);
        pyramid.tileHeights(address).catch((error: unknown) => {
            console.error("A height tile of the camera failed", error);
        });
    };
    for (let face = 0; face < 6; face++) load({ face, lod: 0, x: 0, y: 0 });

    // Most recently asked first.
    const followed: ITileAddress[] = [];
    const follow = (address: ITileAddress): void => {
        const index = followed.findIndex(({ face, x, y }) => face === address.face && x === address.x && y === address.y);
        if (index === 0) return;
        if (index > 0) {
            followed.unshift(...followed.splice(index, 1));
            return;
        }
        load(address);
        followed.unshift(address);
        if (followed.length > FOLLOWED_TILES) pyramid.release(followed.pop()!);
    };

    return (direction) => {
        follow(cubeTileOfDirection(direction, demMaxLOD));
        const { face, u, v } = cubeFaceCoordinates(direction);
        for (let lod = demMaxLOD; lod >= 0; lod--) {
            const height = pyramid.heightAt(u, v, lod, face);
            if (!Number.isNaN(height)) return height;
        }
        return Number.NaN;
    };
}

/** Options of {@link loadMoonBody}. */
export interface ILoadMoonBodyOptions {
    /** DEM tiles kept in memory. Defaults to those of `terrain-config.json`. */
    cacheEntries?: number;
    /** Time a DEM load nobody waits for any more goes on before it is aborted. */
    abortDelayMilliseconds?: number;
    /** Decoder of the imagery tiles. Defaults to the browser decoder. */
    imageryDecoder?: IImageDecoder;
}

/**
 * Reads a body from a tile service: its reference surface, its DEM on the cube index and, when published, its imagery.
 *
 * @param decoder - Decoder of the DEM tiles, such as a worker decoder.
 */
export async function loadMoonBody(service: string, decoder: IDemDecoder, options: ILoadMoonBodyOptions = {}): Promise<IMoonBody> {
    const dataset = await loadMoonDataset(service);
    const childHeightRanges = new ChildHeightRanges();
    const pyramid = cubeDemPyramid(dataset.elevation, decoder, {
        cacheEntries: options.cacheEntries ?? TERRAIN_CONFIG.dem.cacheEntries,
        abortDelayMilliseconds: options.abortDelayMilliseconds ?? TERRAIN_CONFIG.dem.abortDelayMilliseconds,
        childHeightRanges,
    });
    const deepestLOD = dataset.elevation.deepestLOD;
    return {
        name: dataset.elevation.dataset.body,
        surface: dataset.elevation.surface,
        elevation: { pyramid, childHeightRanges, deepestLOD, heightAt: datasetHeightAt(pyramid, deepestLOD) },
        ...(dataset.imagery
            ? {
                  imagery: {
                      load: datasetImageryLoader(dataset.imagery, options.imageryDecoder),
                      maxLOD: dataset.imagery.deepestLOD,
                      // Tiles of the cube hold their shared edges.
                      registration: "point" as const,
                  },
              }
            : {}),
    };
}
