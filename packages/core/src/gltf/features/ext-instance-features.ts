import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { ArrayItem, GLTFLoader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import type { IGLTFLoaderExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtension.js";
import type { INode } from "@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js";

import { BuildKind, type IHasFeatureIds, type IHasInstanceIds } from "./ext-mesh-features.types";

export const EXT_INSTANCE_FEATURES = "EXT_instance_features";
const EXT_MESH_GPU_INSTANCING = "EXT_mesh_gpu_instancing";

/** The instancing extension of a node, as far as this loader reads it. */
interface IGpuInstancing {
    attributes: Record<string, number>;
}

/**
 * Loader of `EXT_instance_features`, ported from SpaceXR (branch tile3D). The sets of feature IDs of an instanced
 * node are kept on the Babylon meshes of the node, as `featureIds`; the IDs of a set stored in an instance attribute
 * `_FEATURE_ID_n` are loaded into `thinInstanceIds`, at the index of the set, one ID per thin instance.
 *
 * A node that carries this extension also carries `EXT_mesh_gpu_instancing`, which the loader of Babylon.js turns into
 * thin instances: the application registers that loader too.
 *
 * [Specification](https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_instance_features)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class EXT_instance_features implements IGLTFLoaderExtension {
    public readonly name = EXT_INSTANCE_FEATURES;
    public enabled: boolean;
    private _loader: Nullable<GLTFLoader>;

    public constructor(loader: GLTFLoader) {
        this._loader = loader;
        // A node extended with EXT_instance_features is invalid without EXT_mesh_gpu_instancing.
        this.enabled = loader.isExtensionUsed(EXT_INSTANCE_FEATURES) && loader.isExtensionUsed(EXT_MESH_GPU_INSTANCING);
    }

    public dispose(): void {
        this._loader = null;
    }

    public loadNodeAsync(
        context: string,
        node: INode,
        assign: (babylonTransformNode: TransformNode) => void,
    ): Nullable<Promise<TransformNode>> {
        const loader = this._loader;
        const instancing = node.extensions?.[EXT_MESH_GPU_INSTANCING] as IGpuInstancing | undefined;
        if (!loader || !instancing) return null;
        return GLTFLoader.LoadExtensionAsync<IHasFeatureIds, TransformNode>(context, node, this.name, (_extensionContext, extension) => {
            const promise = loader.loadNodeAsync(`/nodes/${node.index}`, node, assign);
            if (!node._primitiveBabylonMeshes) return promise;

            const pending: Promise<unknown>[] = [];
            for (const babylonMesh of node._primitiveBabylonMeshes) {
                const holder = babylonMesh as typeof babylonMesh & Partial<IHasInstanceIds>;
                const featureIds = (holder.featureIds ??= []);
                const instanceIds = (holder.thinInstanceIds ??= []);
                for (const featureId of extension.featureIds) {
                    const set = featureIds.push(featureId) - 1;
                    if (featureId.attribute === undefined) continue;
                    const name = BuildKind("_FEATURE_ID_", featureId.attribute);
                    const accessor = ArrayItem.Get(
                        `${context}/extensions/${EXT_MESH_GPU_INSTANCING}/attributes/${name}`,
                        loader.gltf.accessors,
                        instancing.attributes[name],
                    );
                    pending.push(
                        loader._loadIndicesAccessorAsync(`/accessors/${accessor.index}`, accessor).then((data) => {
                            instanceIds[set] = data;
                        }),
                    );
                }
            }
            return Promise.all([promise, ...pending]).then(([babylonTransformNode]) => babylonTransformNode);
        });
    }
}
