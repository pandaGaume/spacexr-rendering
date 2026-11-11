import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import type { Nullable } from "@babylonjs/core/types.js";
import type { GLTFLoader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import type { IGLTFLoaderExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtension.js";
import { registerGLTFExtension, unregisterGLTFExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js";

import {
    getNodePresentation,
    parseSpaceXrGroundReference,
    setNodePresentation,
    SPACEXR_GROUND_REFERENCE,
    type INodePresentation,
} from "./presentation";
import { NodePresentationRuntime } from "./runtime";

/** The glTF node of the loader, as far as this package reads it. */
interface IGltfNode {
    extensions?: Record<string, unknown>;
}

type LoadNode = NonNullable<IGLTFLoaderExtension["loadNodeAsync"]>;

/**
 * Loader of one node extension: it declares what the extension says on the Babylon node, then hands the node to the
 * presentation runtime of the scene once the asset is whole. A malformed extension is reported and ignored: the node
 * keeps the transform written in the glTF, as for a client that does not know the extension.
 */
class NodePresentationLoader implements IGLTFLoaderExtension {
    public enabled: boolean;
    private loader: GLTFLoader | null;
    private readonly nodes: TransformNode[] = [];

    public constructor(
        public readonly name: string,
        loader: GLTFLoader,
        private readonly declare: (value: unknown, presentation: INodePresentation) => void,
    ) {
        this.loader = loader;
        this.enabled = loader.isExtensionUsed(name);
    }

    public loadNodeAsync(
        context: string,
        node: Parameters<LoadNode>[1],
        assign: (babylonNode: TransformNode) => void,
    ): Nullable<Promise<TransformNode>> {
        const value = (node as IGltfNode).extensions?.[this.name];
        if (value === undefined || !this.loader) return null;
        return this.loader.loadNodeAsync(context, node, (babylonNode) => {
            const presentation: INodePresentation = {
                ...getNodePresentation(babylonNode),
            };
            try {
                this.declare(value, presentation);
                setNodePresentation(babylonNode, presentation);
                this.nodes.push(babylonNode);
            } catch (error) {
                Logger.Warn(`${context}: ${this.name} ignored. ${error instanceof Error ? error.message : String(error)}`);
            }
            assign(babylonNode);
        });
    }

    public onReady(): void {
        // The asset is whole: its nodes are where the glTF puts them.
        const runtime = this.loader && NodePresentationRuntime.get(this.loader.babylonScene);
        if (runtime) for (const node of this.nodes) if (!node.isDisposed()) runtime.attach(node);
        this.nodes.length = 0;
    }

    public dispose(): void {
        this.loader = null;
        this.nodes.length = 0;
    }
}

function register(name: string, declare: (value: unknown, presentation: INodePresentation) => void): void {
    unregisterGLTFExtension(name);
    registerGLTFExtension(name, true, (loader) => new NodePresentationLoader(name, loader, declare));
}

/** Registers the loader of `SPACEXR_ground_reference` with the glTF loader of Babylon.js. */
export function registerSpaceXrGroundReferenceLoader(): void {
    register(SPACEXR_GROUND_REFERENCE, (value, presentation) => void (presentation.groundReference = parseSpaceXrGroundReference(value)));
}

/** Registers the loaders of node presentation. An application calls it once, as it registers the glTF loader. */
export function registerNodePresentationLoaders(): void {
    registerSpaceXrGroundReferenceLoader();
}
