import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ITileAddress } from "@spacexr/3d-tiles-runtime";

import { type ITerrainTiling } from "@spacexr/terrain-tileset";
import { TextureArrayPool } from "../../raster/texture-array-pool";

interface IShapeEntry {
    address: ITileAddress;
    layer: number;
    users: number;
}

/** Shapes in use, one layer each in a float texture array shared by every instance: one per key of the surface. */
export class GridShapes {
    public readonly pool: TextureArrayPool;
    private readonly entries = new Map<string, IShapeEntry>();
    private readonly growObserver: Observer<TextureArrayPool>;

    public constructor(
        scene: Scene,
        public readonly cells: number,
        private readonly tiling: Pick<ITerrainTiling, "shapeKey" | "shapeTexels">,
    ) {
        this.pool = new TextureArrayPool(scene, { size: cells + 1, format: "rgba32f", initialLayers: 64 });
        // Float layers are not copied when a WebGL 2 pool grows: write every shape again.
        this.growObserver = this.pool.onGrowObservable.add((pool) => {
            if (pool.layersKeptOnGrowth) return;
            for (const entry of this.entries.values()) this.write(entry);
        });
    }

    /** Layers holding a shape. */
    public get size(): number {
        return this.entries.size;
    }

    /**
     * Uses the shape of a tile until it is released as many times.
     *
     * @returns Its layer, or `undefined` when the texture array is full.
     */
    public acquire(address: ITileAddress): number | undefined {
        const shapeKey = this.tiling.shapeKey(address);
        const existing = this.entries.get(shapeKey);
        if (existing) {
            existing.users++;
            return existing.layer;
        }
        const layer = this.pool.reserve();
        if (layer === undefined) return undefined;
        const entry = { address: { ...address }, layer, users: 1 };
        this.entries.set(shapeKey, entry);
        this.write(entry);
        return layer;
    }

    /** Releases a shape acquired with {@link acquire}; its layer returns to the pool once unused. */
    public release(address: ITileAddress): void {
        const shapeKey = this.tiling.shapeKey(address);
        const entry = this.entries.get(shapeKey);
        if (!entry || --entry.users > 0) return;
        this.entries.delete(shapeKey);
        this.pool.release(entry.layer);
    }

    public dispose(): void {
        this.pool.onGrowObservable.remove(this.growObserver);
        this.entries.clear();
        this.pool.dispose();
    }

    private write(entry: IShapeEntry): void {
        this.pool.write(entry.layer, this.tiling.shapeTexels(entry.address, this.cells));
    }
}
