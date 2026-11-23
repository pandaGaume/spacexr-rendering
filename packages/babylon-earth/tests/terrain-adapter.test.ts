import { describe, it, expect, vi } from "vitest";
import type { GpuTerrainEngine, BabylonRasterPages, IGpuTerrainHandle } from "@spacexr/3d-tiles-babylon";
import { ancestorTileAddress, type ITileAddress } from "@spacexr/tiles";
import { EarthTerrainAdapter } from "../src/terrain-adapter";

/** Deepest level the imagery of the fixtures serves. */
const IMAGERY_MAX_LOD = 2;

/** Terrain handle the fake engine builds for each tile. */
const handles = new Map<unknown, IGpuTerrainHandle>();

function context(handle: IGpuTerrainHandle, accepted: boolean, address = { lod: 1, x: 0, y: 0 }) {
    const tile = { id: "tile", source: { metadata: { properties: address } } };
    handles.set(tile, handle);
    return {
        signal: new AbortController().signal,
        pendingContents: [{ id: "content" }],
        tile,
        readiness: { ready: vi.fn(async () => accepted), failed: vi.fn(), cancelled: vi.fn() },
        resources: [{ handle }],
    } as unknown as Parameters<EarthTerrainAdapter["activate"]>[0] & Parameters<EarthTerrainAdapter["present"]>[0];
}

function fixture(accepted: boolean, address = { lod: 1, x: 0, y: 0 }) {
    const handle = {} as IGpuTerrainHandle;
    const pages = {
        load: vi.fn(async (page: { lod: number; x: number; y: number }) => ({ address: page, layer: 0 })),
        release: vi.fn(),
        present: vi.fn(),
        hide: vi.fn(),
        /** The level each place serves: the deepest of the imagery by default, deeper where a layer is. */
        serving: (_address: ITileAddress) => IMAGERY_MAX_LOD,
        pyramid: {
            maxLOD: IMAGERY_MAX_LOD,
            areaOf: (address: ITileAddress) => {
                const level = Math.min(address.lod, pages.serving(address));
                return { ancestor: address.lod > level ? ancestorTileAddress(address, address.lod - level) : address };
            },
        },
    };
    const terrain = {
        activate: vi.fn(async (activation: Parameters<EarthTerrainAdapter["activate"]>[0]) => {
            await activation.readiness.ready("content", { kind: "renderable", handle: handles.get(activation.tile)! });
        }),
        deactivate: vi.fn(),
        present: vi.fn(),
        hide: vi.fn(),
        release: vi.fn(),
    };
    const adapter = new EarthTerrainAdapter(terrain as unknown as GpuTerrainEngine, pages as unknown as BabylonRasterPages);
    return { adapter, pages, terrain, context: context(handle, accepted, address) };
}
describe("shared terrain and imagery lifecycle", () => {
    it("moves a refreshed tile to the page its place serves now, the new page held before the old one goes", async () => {
        const deep = { lod: 4, x: 3, y: 2 };
        const { adapter, pages, context } = fixture(true, deep);
        await adapter.activate(context);
        adapter.present(context);
        expect(pages.load).toHaveBeenLastCalledWith({ lod: 2, x: 0, y: 0 }, expect.anything());
        // A layer deeper than the imagery comes over the place: it now serves the tile itself.
        pages.serving = () => 4;
        const handle = (context.readiness.ready as ReturnType<typeof vi.fn>).mock.calls[0]![1].handle;
        await adapter.activate({ ...context, refresh: true, pendingContents: [{ id: "content", handle }] } as unknown as typeof context);
        expect(pages.load).toHaveBeenLastCalledWith(deep, expect.anything());
        expect(pages.present).toHaveBeenLastCalledWith(deep);
        expect(pages.hide).toHaveBeenCalledWith({ lod: 2, x: 0, y: 0 });
        expect(pages.release).toHaveBeenCalledWith({ lod: 2, x: 0, y: 0 });
        adapter.release(context);
        expect(pages.release).toHaveBeenLastCalledWith(deep);
    });
    it("keeps accepted imagery until the single runtime releases its terrain handle", async () => {
        const { adapter, pages, terrain, context } = fixture(true);
        await adapter.activate(context);
        expect(pages.release).not.toHaveBeenCalled();
        adapter.present(context);
        expect(pages.present).toHaveBeenCalledOnce();
        expect(terrain.present).toHaveBeenCalledOnce();
        adapter.hide(context);
        expect(pages.hide).toHaveBeenCalledOnce();
        expect(pages.release).not.toHaveBeenCalled();
        adapter.release(context);
        expect(pages.release).toHaveBeenCalledOnce();
        adapter.release(context);
        expect(pages.release).toHaveBeenCalledOnce();
    });
    it("keeps imagery when a cached tile reactivates without pending content", async () => {
        const { adapter, pages, terrain, context } = fixture(true);
        await adapter.activate(context);
        adapter.present(context);
        adapter.hide(context);
        await adapter.activate({ ...context, pendingContents: [] });
        adapter.present(context);
        expect(pages.load).toHaveBeenCalledOnce();
        expect(terrain.activate).toHaveBeenCalledOnce();
        expect(pages.release).not.toHaveBeenCalled();
        expect(pages.present).toHaveBeenCalledTimes(2);
    });
    it("reloads the page of a refreshed tile in place, keeping its terrain handle", async () => {
        const { adapter, pages, terrain, context } = fixture(true);
        await adapter.activate(context);
        const handle = (context.readiness.ready as ReturnType<typeof vi.fn>).mock.calls[0]![1].handle;
        await adapter.activate({ ...context, refresh: true, pendingContents: [{ id: "content", handle }] } as unknown as typeof context);
        expect(pages.load).toHaveBeenCalledTimes(2);
        expect(terrain.activate).toHaveBeenCalledOnce();
        expect(context.readiness.ready).toHaveBeenLastCalledWith("content", { kind: "renderable", handle });
        expect(pages.release).not.toHaveBeenCalled();
    });
    it("releases imagery when tile readiness rejects the terrain resource", async () => {
        const { adapter, pages, context } = fixture(false);
        await adapter.activate(context);
        expect(pages.release).toHaveBeenCalledOnce();
    });
    it("reports failed imagery and does not publish untextured terrain", async () => {
        const { adapter, pages, terrain, context } = fixture(false);
        pages.load.mockRejectedValueOnce(new Error("image unavailable"));
        await adapter.activate(context);
        expect(context.readiness.failed).toHaveBeenCalled();
        expect(terrain.activate).not.toHaveBeenCalled();
    });
});

describe("terrain deeper than its imagery", () => {
    it("drapes a terrain tile below the deepest imagery level with the page of its ancestor at that level", async () => {
        const { adapter, pages, context } = fixture(true, { lod: IMAGERY_MAX_LOD + 2, x: 13, y: 6 });
        await adapter.activate(context);
        expect(pages.load).toHaveBeenCalledWith({ lod: IMAGERY_MAX_LOD, x: 3, y: 1 }, context.signal);
        expect(context.readiness.failed).not.toHaveBeenCalled();
        expect(context.readiness.ready).toHaveBeenCalledOnce();
    });
    it("keeps a page shared by two terrain tiles resident and presented until the last one lets it go", async () => {
        const { adapter, pages, context: parent } = fixture(true, { lod: IMAGERY_MAX_LOD, x: 1, y: 1 });
        const child = context({} as IGpuTerrainHandle, true, { lod: IMAGERY_MAX_LOD + 1, x: 2, y: 3 });
        await adapter.activate(parent);
        await adapter.activate(child);
        expect(pages.load).toHaveBeenNthCalledWith(2, { lod: IMAGERY_MAX_LOD, x: 1, y: 1 }, child.signal);
        adapter.present(parent);
        adapter.present(child);
        expect(pages.present).toHaveBeenCalledOnce();
        adapter.hide(parent);
        adapter.release(parent);
        expect(pages.hide).not.toHaveBeenCalled();
        expect(pages.release).not.toHaveBeenCalled();
        adapter.hide(child);
        expect(pages.hide).toHaveBeenCalledOnce();
        adapter.release(child);
        expect(pages.release).toHaveBeenCalledOnce();
    });
    it("keeps the page another terrain tile holds when an activation on it is rejected", async () => {
        const { adapter, pages, context: parent } = fixture(true, { lod: IMAGERY_MAX_LOD, x: 0, y: 0 });
        const rejected = context({} as IGpuTerrainHandle, false, { lod: IMAGERY_MAX_LOD + 1, x: 1, y: 0 });
        await adapter.activate(parent);
        await adapter.activate(rejected);
        expect(pages.release).not.toHaveBeenCalled();
        adapter.release(parent);
        expect(pages.release).toHaveBeenCalledOnce();
    });
});
