import type { ITerrainEngine } from "@spacexr/3d-tiles-babylon";
import type { BabylonRasterPages, IBabylonRasterPage } from "@spacexr/3d-tiles-babylon";
import { metadataTileAddress } from "@spacexr/terrain-tileset";
import { ResidentTiles, ancestorTileAddress, type ITileAddress } from "@spacexr/tiles";
import type {
    IEcefSpatialState,
    ITileActivationContext,
    ITileDeactivationContext,
    ITilePresentationContext,
} from "@spacexr/3d-tiles-runtime";

type Activation = ITileActivationContext<IEcefSpatialState, unknown, never>;
type Presentation = ITilePresentationContext<IEcefSpatialState, unknown, never>;
/**
 * Couples imagery residency to the terrain cut. Selection remains exclusively in TileRuntime.
 *
 * A terrain tile deeper than the imagery is draped with the page of its ancestor at the deepest imagery level, as the
 * drape reads the nearest resident page that covers it. One page then serves several terrain handles: it stays
 * resident while one of them holds it, and presented while one of them is presented.
 */
export class EarthTerrainAdapter {
    private readonly pagesByHandle = new Map<unknown, IBabylonRasterPage>();
    /** Terrain handles, and activations in flight, holding each page. */
    private readonly holders = new ResidentTiles<number>();
    /** Presented terrain handles draped with each page. */
    private readonly presenters = new ResidentTiles<number>();
    private readonly presented = new Set<unknown>();
    public constructor(
        private readonly terrain: ITerrainEngine,
        private readonly pages: BabylonRasterPages | undefined,
    ) {}
    public async activate(context: Activation): Promise<void> {
        // Cached content already owns its imagery. An empty activation must not release that page.
        if (context.pendingContents.length === 0) return;
        if (context.refresh) return this.refresh(context);
        if (!this.pages) return this.terrain.activate(context);
        const address = this.imageryAddress(metadataTileAddress(context.tile));
        let page: IBabylonRasterPage | undefined;
        let retained = false;
        try {
            page = await this.pages.load(address, context.signal);
            if (!page) throw new Error("No imagery serves the selected terrain tile.");
            const loaded = page;
            // Held while the terrain activates, so that another tile releasing the same page does not take it away.
            this.hold(loaded.address);
            await this.terrain.activate({
                ...context,
                readiness: {
                    ...context.readiness,
                    ready: async (id, resource) => {
                        const accepted = await context.readiness.ready(id, resource);
                        if (accepted && resource.kind === "renderable") {
                            this.pagesByHandle.set(resource.handle, loaded);
                            if (retained) this.hold(loaded.address);
                            retained = true;
                        }
                        return accepted;
                    },
                },
            });
        } catch (error) {
            for (const content of context.pendingContents) {
                if (context.signal.aborted) await context.readiness.cancelled(content.id);
                else await context.readiness.failed(content.id, error);
            }
        } finally {
            if (page && !retained) this.unhold(page.address);
        }
    }
    /**
     * Reloads the imagery of invalidated tiles: their stale pages are rewritten in place, through the imagery loader
     * of the application. The terrain handles stay, and stay presented while the pages reload.
     */
    private async refresh(context: Activation): Promise<void> {
        for (const content of context.pendingContents) {
            const handle = content.handle;
            try {
                if (handle === undefined) {
                    await context.readiness.cancelled(content.id);
                    continue;
                }
                const page = this.pagesByHandle.get(handle);
                if (page) await this.pages!.load(page.address, context.signal);
                await context.readiness.ready(content.id, { kind: "renderable", handle });
            } catch (error) {
                if (context.signal.aborted) await context.readiness.cancelled(content.id);
                else await context.readiness.failed(content.id, error);
            }
        }
    }
    public deactivate(context: ITileDeactivationContext<IEcefSpatialState, unknown, never>): void {
        this.terrain.deactivate(context);
    }
    public present(context: Presentation): void {
        for (const resource of context.resources) {
            const page = this.pagesByHandle.get(resource.handle);
            if (page && !this.presented.has(resource.handle)) {
                this.presented.add(resource.handle);
                const count = (this.presenters.get(page.address) ?? 0) + 1;
                this.presenters.set(page.address, count);
                if (count === 1) this.pages!.present(page.address);
            }
        }
        this.terrain.present(context);
    }
    public hide(context: Presentation): void {
        this.terrain.hide?.(context);
        for (const resource of context.resources) this.unpresent(resource.handle);
    }
    public release(context: Presentation): void {
        this.terrain.release?.(context);
        for (const resource of context.resources) {
            const page = this.pagesByHandle.get(resource.handle);
            if (page) {
                this.unpresent(resource.handle);
                this.pagesByHandle.delete(resource.handle);
                this.unhold(page.address);
            }
        }
    }
    /** The imagery tile of a terrain tile: the tile itself, or its ancestor at the deepest level the imagery serves. */
    private imageryAddress(address: ITileAddress): ITileAddress {
        const deepest = this.pages!.pyramid.maxLOD;
        return address.lod > deepest ? ancestorTileAddress(address, address.lod - deepest) : address;
    }
    private hold(address: ITileAddress): void {
        this.holders.set(address, (this.holders.get(address) ?? 0) + 1);
    }
    /** Lets go of a page; the last holder releases it. */
    private unhold(address: ITileAddress): void {
        const count = (this.holders.get(address) ?? 0) - 1;
        if (count > 0) {
            this.holders.set(address, count);
            return;
        }
        this.holders.delete(address);
        this.pages!.release(address);
    }
    /** Withdraws a terrain handle from the presenters of its page; the last one hides the page. */
    private unpresent(handle: unknown): void {
        const page = this.pagesByHandle.get(handle);
        if (!page || !this.presented.delete(handle)) return;
        const count = (this.presenters.get(page.address) ?? 0) - 1;
        if (count > 0) {
            this.presenters.set(page.address, count);
            return;
        }
        this.presenters.delete(page.address);
        this.pages!.hide(page.address);
    }
}
