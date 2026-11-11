import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Node } from "@babylonjs/core/node.js";

import { HasFeatureIds, type IFeatureId, type IHasInstanceIds } from "./ext-mesh-features.types";
import { IsHasStructuralMetadata, type IStructuralMetadata, type MetadataValue } from "./ext-structural-metadata.types";

/** A feature of a mesh: its ID in a set of the mesh, and its row of the property table of that set. */
export interface IMeshFeature {
    featureId: number;
    /** Index of the set among the `featureIds` of the mesh. */
    featureIdSet: number;
    /** Index of the property table of the set, when it names one. */
    propertyTable?: number;
    /** Class of the property table. */
    class?: string;
    /** The values of the feature, for the columns that were read. */
    properties?: Record<string, MetadataValue>;
}

/** The structural metadata of the asset a node belongs to: that of the nearest ancestor that holds one. */
export function findStructuralMetadata(node: Node): IStructuralMetadata | undefined {
    for (let current: Node | null = node; current; current = current.parent)
        if (IsHasStructuralMetadata(current)) return current.structuralMetadata;
    return undefined;
}

/**
 * The feature a face of a mesh belongs to, as `EXT_mesh_features` and `EXT_structural_metadata` say it: the face is
 * the one a pick returns (`PickingInfo.faceId`). The feature ID is read at the first vertex of the face, from a set
 * stored in a vertex attribute or given implicitly; a set stored in a texture is not read here.
 *
 * @param set Index of the set of feature IDs of the mesh. Defaults to the first.
 * @returns undefined for a mesh without feature IDs, or a face that belongs to no feature.
 */
export function getMeshFeature(mesh: AbstractMesh, faceId: number, set = 0): IMeshFeature | undefined {
    // An instance shares the geometry, and so the features, of the mesh it repeats.
    const source = (mesh as InstancedMesh).sourceMesh ?? mesh;
    if (!HasFeatureIds(source)) return undefined;
    const featureIds = source.featureIds[set];
    if (!featureIds?.vertexAttributeKind || featureIds.textureData || featureIds.texture) return undefined;
    const ids = source.getVerticesData(featureIds.vertexAttributeKind);
    if (!ids) return undefined;
    const indices = source.getIndices();
    const vertex = indices?.length ? indices[faceId * 3] : faceId * 3;
    const featureId = vertex === undefined ? undefined : ids[vertex];
    if (featureId === undefined || featureId === featureIds.nullFeatureId) return undefined;

    return describe(mesh, featureIds, featureId, set);
}

/**
 * The feature a thin instance of a mesh belongs to, as `EXT_instance_features` says it: the instance is the one a
 * pick returns (`PickingInfo.thinInstanceIndex`).
 *
 * @param set Index of the set of feature IDs of the mesh. Defaults to the first set that gives instance IDs.
 */
export function getInstanceFeature(mesh: AbstractMesh, thinInstanceIndex: number, set?: number): IMeshFeature | undefined {
    const source = (mesh as InstancedMesh).sourceMesh ?? mesh;
    if (!HasFeatureIds(source)) return undefined;
    const instanceIds = (source as Partial<IHasInstanceIds>).thinInstanceIds;
    const index = set ?? instanceIds?.findIndex((ids) => ids !== undefined) ?? -1;
    const featureIds = source.featureIds[index];
    const featureId = instanceIds?.[index]?.[thinInstanceIndex];
    if (!featureIds || featureId === undefined || featureId === featureIds.nullFeatureId) return undefined;
    return describe(mesh, featureIds, featureId, index);
}

/** A feature with its row of the property table of its set. */
function describe(mesh: AbstractMesh, featureIds: IFeatureId, featureId: number, set: number): IMeshFeature {
    const feature: IMeshFeature = { featureId, featureIdSet: set };
    if (featureIds.propertyTable === undefined) return feature;
    feature.propertyTable = featureIds.propertyTable;
    const table = findStructuralMetadata(mesh)?.propertyTables?.[featureIds.propertyTable];
    if (!table) return feature;
    feature.class = table.class;
    if (table.values) {
        feature.properties = {};
        for (const [name, column] of Object.entries(table.values)) {
            const value = column[featureId];
            if (value !== undefined) feature.properties[name] = value;
        }
    }
    return feature;
}
