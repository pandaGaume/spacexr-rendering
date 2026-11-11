import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { ArrayItem, type GLTFLoader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import type { IGLTFLoaderExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtension.js";
import type { IMeshPrimitive } from "@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js";

import { BuildKind, FEATURE_ID_KIND_PREFIX, HasFeatureIds, type IFeatureId, type IHasFeatureIds } from "./ext-mesh-features.types";

export const EXT_MESH_FEATURES = "EXT_mesh_features";
const UV_KIND_PREFIX = "uv";

/** The vertex data loading of the glTF loader, which its typings keep private. */
interface IVertexDataLoader {
    _loadVertexDataAsync(context: string, primitive: IMeshPrimitive, babylonMesh: Mesh): Promise<Geometry>;
}

/**
 * Loads the vertex data of a primitive as the loader does without this extension: the other extensions, such as the
 * mesh compressions, still apply. It must be called while the hook of the calling extension runs, not after.
 */
export function loadDefaultVertexData(
    loader: GLTFLoader,
    context: string,
    primitive: IMeshPrimitive,
    babylonMesh: Mesh,
): Promise<Geometry> {
    return (loader as unknown as IVertexDataLoader)._loadVertexDataAsync(context, primitive, babylonMesh);
}

/**
 * Loader of `EXT_mesh_features`, ported from SpaceXR (branch tile3D). The sets of feature IDs of a primitive are
 * kept on its Babylon mesh as `featureIds`, and their values are loaded:
 *
 * - a set stored in an attribute `_FEATURE_ID_n` becomes a vertex buffer of kind `fid<n>` of the geometry;
 * - a set stored in a texture gets its texture as `textureData`, read with the UV set `uv<texCoord>`;
 * - an implicit set, where a vertex has its index as feature ID, becomes a vertex buffer of indices.
 *
 * The geometry itself is loaded by the loader: this extension only adds the feature IDs to it.
 *
 * [Specification](https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_mesh_features)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class EXT_mesh_features implements IGLTFLoaderExtension {
    public static readonly VerticeKindPrefix = FEATURE_ID_KIND_PREFIX;
    public static BuildKind = BuildKind;

    public readonly name = EXT_MESH_FEATURES;
    public enabled: boolean;
    private _loader: Nullable<GLTFLoader>;

    public constructor(loader: GLTFLoader) {
        this._loader = loader;
        this.enabled = loader.isExtensionUsed(EXT_MESH_FEATURES);
    }

    public dispose(): void {
        this._loader = null;
    }

    /** @internal */
    public _loadVertexDataAsync(context: string, primitive: IMeshPrimitive, babylonMesh: Mesh): Nullable<Promise<Geometry>> {
        const loader = this._loader;
        const extension = primitive.extensions?.[EXT_MESH_FEATURES] as unknown;
        if (!loader || !HasFeatureIds(extension)) return null;

        // The mesh is the object the sets of a primitive are kept on.
        const holder = babylonMesh as Mesh & Partial<IHasFeatureIds>;
        const featureIds = (holder.featureIds ??= []);
        featureIds.push(...extension.featureIds);

        const geometry = loadDefaultVertexData(loader, context, primitive, babylonMesh);
        const pending: Promise<unknown>[] = [];
        const buffers: { buffer: VertexBuffer; count: number }[] = [];
        const implicit: IFeatureId[] = [];
        let attributes = 0;
        extension.featureIds.forEach((featureId, index) => {
            if (featureId.attribute !== undefined) {
                const name = BuildKind("_FEATURE_ID_", featureId.attribute);
                const kind = (featureId.vertexAttributeKind = BuildKind(FEATURE_ID_KIND_PREFIX, featureId.attribute));
                const accessor = ArrayItem.Get(`${context}/attributes/${name}`, loader.gltf.accessors, primitive.attributes[name]);
                pending.push(
                    loader._loadVertexAccessorAsync(`/accessors/${accessor.index}`, accessor, kind).then((buffer) => {
                        buffers.push({ buffer, count: accessor.count });
                    }),
                );
                attributes++;
            } else if (featureId.texture) {
                featureId.vertexAttributeKind = BuildKind(UV_KIND_PREFIX, featureId.texture.texCoord ?? 0);
                pending.push(
                    loader.loadTextureInfoAsync(
                        `${context}/extensions/${EXT_MESH_FEATURES}/featureIds/${index}/texture`,
                        featureId.texture,
                        (texture) => {
                            featureId.textureData = texture;
                        },
                    ),
                );
            } else {
                // The set gets its kind once the sets stored in attributes are counted.
                implicit.push(featureId);
            }
        });
        const engine = loader.babylonScene.getEngine();
        for (const featureId of implicit) {
            const kind = (featureId.vertexAttributeKind = BuildKind(FEATURE_ID_KIND_PREFIX, attributes++));
            const indices = Array.from({ length: featureId.featureCount }, (_, vertex) => vertex);
            buffers.push({
                buffer: new VertexBuffer(engine, indices, kind, false, undefined, 1, false, 0, 1),
                count: featureId.featureCount,
            });
        }

        return Promise.all([geometry, ...pending]).then(([babylonGeometry]) => {
            for (const { buffer, count } of buffers) babylonGeometry.setVerticesBuffer(buffer, count);
            return babylonGeometry;
        });
    }
}
