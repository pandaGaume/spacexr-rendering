import { Observable } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { RasterPyramid, type IRasterGrid, type IRasterPyramidOptions } from "@spacexr/raster";
import { ResidentTiles, type ITileAddress } from "@spacexr/tiles";

import { TextureArrayPool } from "./texture-array-pool";

/** 8-bit colour raster of an imagery tile, three or four channels. */
export type ColorRasterGrid = IRasterGrid<Uint8Array | Uint8ClampedArray>;

export interface IBabylonRasterPagesOptions extends Omit<IRasterPyramidOptions<ColorRasterGrid>, "create" | "onStitched"> {
    /** Width and height of the tiles of the pyramid, in pixels. Pages hold one more column and row. */
    tileSize: number;
    /** Layers allocated at creation. Defaults to 64. */
    initialLayers?: number;
}

/** Page of one imagery tile in the texture array. */
export interface IBabylonRasterPage {
    address: ITileAddress;
    layer: number;
}

/**
 * Imagery pages shared by every draping engine: a stitched raster pyramid, the GPU texture array holding the pages,
 * and the index of resident pages that bindings look up.
 *
 * A page is the stitched raster of one tile, `tileSize + 1` texels wide in point registration whatever the
 * registration declared by the source, so that neighbouring
 * pages hold the same texels on their shared edge. When a neighbour arrives later, the pages it completes are
 * written again. `changed` notifies every page that became resident, was rewritten or left.
 *
 * When the source changes, {@link invalidate} starts a new pyramid, which loads the rasters again, and marks pages
 * stale. Loading a stale page reloads its raster and writes it into the same layer: the page keeps being displayed
 * until its new texels replace the previous ones.
 */
export class BabylonRasterPages {
    public readonly pool: TextureArrayPool;
    /** Resident pages by tile, valued by layer. */
    public readonly resident = new ResidentTiles<number>();
    /** Imagery tiles the runtime presents: the imagery cut, which sets how deep terrain tiles are draped. */
    public readonly presented = new ResidentTiles<true>();
    /** Notifies the tile of each page that became resident, was rewritten or left, or was presented or hidden. */
    public readonly changed = new Observable<ITileAddress>();
    private readonly pageSize: number;
    private readonly buffer: Uint8Array;
    private readonly pyramidOptions: Omit<IRasterPyramidOptions<ColorRasterGrid>, "create" | "onStitched">;
    private current: RasterPyramid<ColorRasterGrid>;
    /** Resident pages written before an invalidation that covers them, until they are reloaded. */
    private readonly stale = new ResidentTiles<true>();
    /** Resident pages written from the current pyramid, which its stitching completes. */
    private fresh = new ResidentTiles<true>();

    public constructor(scene: Scene, options: IBabylonRasterPagesOptions) {
        const { tileSize, initialLayers, ...pyramid } = options;
        this.pageSize = tileSize + 1;
        this.buffer = new Uint8Array(this.pageSize * this.pageSize * 4);
        this.pool = new TextureArrayPool(scene, {
            size: this.pageSize,
            ...(initialLayers === undefined ? {} : { initialLayers }),
        });
        this.pyramidOptions = pyramid;
        this.current = this.createPyramid();
    }

    /** Texels per page side. */
    public get size(): number {
        return this.pageSize;
    }

    /** Raster pyramid of the current source; {@link invalidate} replaces it. */
    public get pyramid(): RasterPyramid<ColorRasterGrid> {
        return this.current;
    }

    /**
     * The source changed: rasters load again, from a new pyramid, and the resident pages the predicate selects, all
     * by default, become stale. A stale page stays displayed; the next {@link load} of its tile reloads it in place.
     * The other pages keep their texels. Retains taken on the previous pyramid are not carried over.
     *
     * @param affects - Whether the data of a tile changed, such as its extent crossing an edited area. Include the
     *     tiles that only touch that area: their shared edge changes too.
     * @returns The tiles of the pages that became stale.
     */
    public invalidate(affects?: (address: ITileAddress) => boolean): ITileAddress[] {
        this.current = this.createPyramid();
        this.fresh = new ResidentTiles<true>();
        const invalidated: ITileAddress[] = [];
        for (const address of [...this.resident.addresses()]) {
            if (affects && !affects(address)) continue;
            this.stale.set(address, true);
            invalidated.push({ ...address });
        }
        return invalidated;
    }

    /** Whether the page of a tile is resident and waits for its reload. */
    public isStale(address: ITileAddress): boolean {
        return this.stale.has(address);
    }

    /**
     * Loads the raster of a tile and makes its page resident. A stale page is reloaded into its layer.
     *
     * @returns The page, or `undefined` when the pyramid has no raster there or the texture array is full. A stale
     *     page the pyramid no longer serves keeps its texels.
     */
    public async load(address: ITileAddress, signal?: AbortSignal): Promise<IBabylonRasterPage | undefined> {
        for (;;) {
            signal?.throwIfAborted();
            const existing = this.resident.get(address);
            if (existing !== undefined && !this.stale.has(address)) return { address, layer: existing };
            const pyramid = this.current;
            if (address.lod > pyramid.maxLOD) return existing === undefined ? undefined : { address, layer: existing };
            const region = await pyramid.load(address, signal);
            signal?.throwIfAborted();
            // Invalidated while it loaded: this raster may predate the change.
            if (pyramid !== this.current) continue;
            const layer = this.resident.get(address);
            if (layer !== undefined) {
                if (this.stale.delete(address) && region) this.write(address, layer, region.grid);
                return { address, layer };
            }
            if (!region) return undefined;
            const reserved = this.pool.reserve();
            if (reserved === undefined) return undefined;
            this.resident.set(address, reserved);
            this.write(address, reserved, region.grid);
            return { address, layer: reserved };
        }
    }

    /** Marks an imagery tile as part of the cut the runtime presents. */
    public present(address: ITileAddress): void {
        if (this.presented.has(address)) return;
        this.presented.set(address, true);
        this.changed.notifyObservers(address);
    }

    /** Removes an imagery tile from the presented cut; its page stays resident. */
    public hide(address: ITileAddress): void {
        if (this.presented.delete(address)) this.changed.notifyObservers(address);
    }

    /** Releases the page of a tile; the raster stays in the pyramid cache. */
    public release(address: ITileAddress): void {
        const layer = this.resident.get(address);
        this.presented.delete(address);
        if (layer === undefined) return;
        this.resident.delete(address);
        this.stale.delete(address);
        this.fresh.delete(address);
        this.pool.release(layer);
        this.changed.notifyObservers(address);
    }

    public dispose(): void {
        this.changed.clear();
        this.pool.dispose();
    }

    private createPyramid(): RasterPyramid<ColorRasterGrid> {
        const pyramid: RasterPyramid<ColorRasterGrid> = new RasterPyramid<ColorRasterGrid>({
            ...this.pyramidOptions,
            onStitched: (changed) => {
                // A replaced pyramid still finishing its loads no longer writes pages.
                if (pyramid !== this.current) return;
                for (const address of changed) this.rewrite(address);
            },
        });
        return pyramid;
    }

    private write(address: ITileAddress, layer: number, grid: ColorRasterGrid): void {
        this.upload(layer, grid);
        this.fresh.set(address, true);
        this.changed.notifyObservers(address);
    }

    /**
     * Writes the stitched raster of a resident page again, after a neighbour completed it. Only pages written from
     * the current pyramid: the others keep their complete texels until they are loaded again.
     */
    private rewrite(address: ITileAddress): void {
        const layer = this.resident.get(address);
        const grid = this.current.stitchedGrid(address);
        if (layer === undefined || !grid || !this.fresh.has(address)) return;
        this.upload(layer, grid);
        this.changed.notifyObservers(address);
    }

    private upload(layer: number, grid: ColorRasterGrid): void {
        const { width, height, channels, data } = grid;
        if (width !== this.pageSize || height !== this.pageSize)
            throw new RangeError(`Expected ${this.pageSize} x ${this.pageSize} stitched texels, received ${width} x ${height}.`);
        if (channels === 4) {
            this.pool.write(layer, new Uint8Array(data.buffer, data.byteOffset, data.length));
            return;
        }
        const buffer = this.buffer;
        for (let texel = 0; texel < width * height; texel++) {
            const offset = texel * channels;
            buffer[texel * 4] = data[offset]!;
            buffer[texel * 4 + 1] = data[offset + Math.min(1, channels - 1)]!;
            buffer[texel * 4 + 2] = data[offset + Math.min(2, channels - 1)]!;
            buffer[texel * 4 + 3] = 255;
        }
        this.pool.write(layer, buffer);
    }
}
