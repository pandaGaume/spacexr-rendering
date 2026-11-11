import type { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { ArrayItem, type GLTFLoader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import type { IGLTFLoaderExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtension.js";
import type { IMeshPrimitive } from "@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js";

import { loadDefaultVertexData } from "./ext-mesh-features";
import type { IHasStructuralMetadata, IMetadataPrimitiveIndex, IStructuralMetadata } from "./ext-structural-metadata.types";
import { readPropertyTable } from "./property-table";

export const EXT_STRUCTURAL_METADATA = "EXT_structural_metadata";

/**
 * Loader of `EXT_structural_metadata`, ported from SpaceXR (branch tile3D). The metadata of the asset is kept on the
 * root of what the loader creates, as `structuralMetadata`: its schema, its property tables, its property attributes
 * and its property textures, as the document holds them.
 *
 * - The attributes of the property attributes a primitive names become vertex buffers of its geometry, their kind
 *   the name of the attribute.
 * - The textures of the property textures a primitive names are loaded into `textures` of the property texture.
 * - The columns of the property tables are read into `values` of each table, when the asset embeds its schema: the
 *   types of the columns are those of the class. A schema given by `schemaUri` is not fetched: the tables then keep
 *   their buffer view indices only.
 *
 * [Specification](https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_structural_metadata)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class EXT_structural_metadata implements IGLTFLoaderExtension {
    public readonly name = EXT_STRUCTURAL_METADATA;
    public enabled: boolean;
    private _loader: Nullable<GLTFLoader>;
    private _metadata: Nullable<IStructuralMetadata> = null;

    public constructor(loader: GLTFLoader) {
        this._loader = loader;
        this.enabled = loader.isExtensionUsed(EXT_STRUCTURAL_METADATA);
    }

    public dispose(): void {
        this._loader = null;
        this._metadata = null;
    }

    /** @internal */
    public onLoading(): void {
        const loader = this._loader;
        const extension = loader?.gltf.extensions?.[EXT_STRUCTURAL_METADATA] as IStructuralMetadata | undefined;
        const root = loader?.rootBabylonMesh as (IHasStructuralMetadata & object) | null | undefined;
        if (!extension || !root) return;
        this._metadata = root.structuralMetadata = {
            ...(extension.schema ? { schema: extension.schema } : {}),
            ...(extension.schemaUri ? { schemaUri: extension.schemaUri } : {}),
            ...(extension.propertyTables ? { propertyTables: extension.propertyTables } : {}),
            ...(extension.propertyAttributes ? { propertyAttributes: extension.propertyAttributes } : {}),
            ...(extension.propertyTextures ? { propertyTextures: extension.propertyTextures } : {}),
        };
    }

    /** @internal */
    public _loadVertexDataAsync(context: string, primitive: IMeshPrimitive, babylonMesh: Mesh): Nullable<Promise<Geometry>> {
        const loader = this._loader;
        const metadata = this._metadata;
        const extension = primitive.extensions?.[EXT_STRUCTURAL_METADATA] as IMetadataPrimitiveIndex | undefined;
        if (!loader || !metadata || !extension) return null;

        const geometry = loadDefaultVertexData(loader, context, primitive, babylonMesh);
        const pending: Promise<unknown>[] = [];
        const buffers: { buffer: VertexBuffer; count: number }[] = [];
        for (const index of extension.propertyAttributes ?? []) {
            const reference = metadata.propertyAttributes?.[index];
            for (const property of Object.values(reference?.properties ?? {})) {
                if (primitive.attributes[property.attribute] === undefined) continue;
                const accessor = ArrayItem.Get(
                    `${context}/attributes/${property.attribute}`,
                    loader.gltf.accessors,
                    primitive.attributes[property.attribute],
                );
                pending.push(
                    loader._loadVertexAccessorAsync(`/accessors/${accessor.index}`, accessor, property.attribute).then((buffer) => {
                        buffers.push({ buffer, count: accessor.count });
                    }),
                );
            }
        }
        for (const index of extension.propertyTextures ?? []) {
            const reference = metadata.propertyTextures?.[index];
            if (!reference) continue;
            for (const [name, info] of Object.entries(reference.properties)) {
                pending.push(
                    loader.loadTextureInfoAsync(
                        `/extensions/${EXT_STRUCTURAL_METADATA}/propertyTextures/${index}/properties/${name}`,
                        info,
                        (texture) => {
                            (reference.textures ??= {})[name] = texture;
                        },
                    ),
                );
            }
        }

        return Promise.all([geometry, ...pending]).then(([babylonGeometry]) => {
            for (const { buffer, count } of buffers) babylonGeometry.setVerticesBuffer(buffer, count);
            return babylonGeometry;
        });
    }

    /** @internal */
    public async onReady(): Promise<void> {
        const loader = this._loader;
        const metadata = this._metadata;
        if (!loader || !metadata?.propertyTables?.length) return;
        const schema = metadata.schema;
        if (!schema) {
            Logger.Warn(`${EXT_STRUCTURAL_METADATA}: the schema is not embedded (schemaUri); the property tables are not read.`);
            return;
        }
        const read = async (index: number): Promise<Uint8Array> => {
            const bufferView = ArrayItem.Get(`/bufferViews/${index}`, loader.gltf.bufferViews, index);
            const data = await loader.loadBufferViewAsync(`/bufferViews/${bufferView.index}`, bufferView);
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        };
        await Promise.all(
            metadata.propertyTables.map(async (table, index) => {
                try {
                    const columns = await readPropertyTable(table, schema, read);
                    table.values = columns.values;
                    if (columns.skipped.length)
                        Logger.Warn(
                            `${EXT_STRUCTURAL_METADATA}: propertyTables/${index}: properties not read: ${columns.skipped.join(", ")}.`,
                        );
                } catch (error) {
                    Logger.Warn(
                        `${EXT_STRUCTURAL_METADATA}: propertyTables/${index} cannot be read. ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }),
        );
    }
}
