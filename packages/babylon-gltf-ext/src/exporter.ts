import type { Node } from "@babylonjs/core/node.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { GLTFExporter } from "@babylonjs/serializers/glTF/2.0/glTFExporter.js";
import type { IGLTFExporterExtensionV2 } from "@babylonjs/serializers/glTF/2.0/glTFExporterExtension.js";

import { getNodePresentation, SPACEXR_GROUND_REFERENCE, type INodePresentation } from "./presentation";

type ExportNode = NonNullable<IGLTFExporterExtensionV2["postExportNodeAsync"]>;
type GltfNode = Parameters<ExportNode>[1];

/**
 * Exporter of one node extension: it writes what the application declared on a Babylon node into its glTF node. The
 * extension is listed in `extensionsUsed` when a node carries it, and never in `extensionsRequired`: a client that
 * does not know it shows the node with the transform written in the glTF.
 */
class NodePresentationExporter implements IGLTFExporterExtensionV2 {
    public enabled = true;
    public readonly required = false;
    public wasUsed = false;

    public constructor(
        public readonly name: string,
        private readonly select: (presentation: INodePresentation) => object | undefined,
    ) {}

    public async postExportNodeAsync(_context: string, node: GltfNode, babylonNode: Node): Promise<Nullable<GltfNode>> {
        const presentation = getNodePresentation(babylonNode);
        const value = presentation && this.select(presentation);
        if (value) {
            node.extensions = { ...node.extensions, [this.name]: value };
            this.wasUsed = true;
        }
        return node;
    }

    public dispose(): void {
        // Nothing is held between two exports.
    }
}

/**
 * Where exporter extensions are registered: the `GLTFExporter` class of the Babylon.js serializers. An application
 * that may hold another copy of the serializers than this package resolves passes its own class.
 */
export interface IGltfExporterRegistry {
    // The classes of another copy of Babylon.js are other types to the compiler, though the same at run time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RegisterExtension(name: string, factory: (exporter: any) => any, order?: number): void;
    UnregisterExtension(name: string): boolean;
}

function register(registry: IGltfExporterRegistry, name: string, select: (presentation: INodePresentation) => object | undefined): void {
    registry.UnregisterExtension(name);
    registry.RegisterExtension(name, () => new NodePresentationExporter(name, select));
}

/** Registers the exporter of `SPACEXR_ground_reference` with the glTF exporter of Babylon.js. */
export function registerSpaceXrGroundReferenceExporter(registry: IGltfExporterRegistry = GLTFExporter): void {
    register(
        registry,
        SPACEXR_GROUND_REFERENCE,
        (presentation) => presentation.groundReference && { offset: presentation.groundReference.offset ?? 0 },
    );
}

/** Registers the exporters of node presentation. An application calls it once, before it exports glTF. */
export function registerNodePresentationExporters(registry: IGltfExporterRegistry = GLTFExporter): void {
    registerSpaceXrGroundReferenceExporter(registry);
}
