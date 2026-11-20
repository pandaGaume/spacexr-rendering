import type { ITerrainEngine } from "@spacexr/3d-tiles-babylon";
import type { BabylonRasterPages, IBabylonRasterPage } from "@spacexr/3d-tiles-babylon";
import { metadataTileAddress } from "@spacexr/terrain-tileset";
import type {
    IEcefSpatialState,
    ITileActivationContext,
    ITileDeactivationContext,
    ITilePresentationContext,
} from "@spacexr/3d-tiles-runtime";

type Activation = ITileActivationContext<IEcefSpatialState, unknown, never>;
type Presentation = ITilePresentationContext<IEcefSpatialState, unknown, never>;
/** Couples imagery residency to the terrain cut. Selection remains exclusively in TileRuntime. */
export class EarthTerrainAdapter {
    private readonly pagesByHandle = new Map<unknown, IBabylonRasterPage>();
    public constructor(
        private readonly terrain: ITerrainEngine,
        private readonly pages: BabylonRasterPages | undefined,
    ) {}
    public async activate(context: Activation): Promise<void> {
        // Cached content already owns its imagery. An empty activation must not release that page.
        if (context.pendingContents.length === 0) return;
        if (context.refresh) return this.refresh(context);
        if (!this.pages) return this.terrain.activate(context);
        const address = metadataTileAddress(context.tile);
        let page: IBabylonRasterPage | undefined;
        let retained = false;
        try {
            page = await this.pages.load(address, context.signal);
            if (!page) throw new Error("No imagery serves the selected terrain tile.");
            const loaded = page;
            await this.terrain.activate({
                ...context,
                readiness: {
                    ...context.readiness,
                    ready: async (id, resource) => {
                        const accepted = await context.readiness.ready(id, resource);
                        if (accepted && resource.kind === "renderable") {
                            this.pagesByHandle.set(resource.handle, loaded);
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
            if (page && !retained) this.pages.release(page.address);
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
            if (page) this.pages!.present(page.address);
        }
        this.terrain.present(context);
    }
    public hide(context: Presentation): void {
        this.terrain.hide?.(context);
        for (const resource of context.resources) {
            const page = this.pagesByHandle.get(resource.handle);
            if (page) this.pages!.hide(page.address);
        }
    }
    public release(context: Presentation): void {
        this.terrain.release?.(context);
        for (const resource of context.resources) {
            const page = this.pagesByHandle.get(resource.handle);
            if (page) {
                this.pages!.release(page.address);
                this.pagesByHandle.delete(resource.handle);
            }
        }
    }
}
