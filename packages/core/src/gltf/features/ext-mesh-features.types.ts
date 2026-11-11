import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { IndicesArray } from "@babylonjs/core/types.js";
import type { ITextureInfo } from "@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js";

// Ported from SpaceXR (packages/dev/babylon/src/tiles/3d/babylon/gltf/2.0/extensions, branch tile3D).

/** What every object of a glTF document may carry. */
export interface IProperty {
    extensions?: Record<string, unknown>;
    extras?: unknown;
}

/**
 * An integer used to build `_FEATURE_ID_<set index>`, a key of the attributes of a primitive: 0 is `_FEATURE_ID_0`.
 */
export type FeatureIdAttribute = number;

/** A texture containing feature IDs. */
export interface IFeatureIdTexture extends ITextureInfo {
    /** Texture channels containing feature IDs, packed in little-endian order when one channel is not enough. */
    channels?: Array<number>;
}

/** A set of feature IDs of a primitive. */
export interface IFeatureId extends IProperty {
    /** The number of unique features in the attribute or texture. */
    featureCount: number;
    /** A value that indicates that no feature is associated with this vertex or texel. */
    nullFeatureId?: number;
    /** An attribute containing feature IDs. Without `attribute` and `texture`, a vertex has its index as feature ID. */
    attribute?: FeatureIdAttribute;
    /** A texture containing feature IDs. */
    texture?: IFeatureIdTexture;
    /** The index of the property table of `EXT_structural_metadata` that holds the values of the features. */
    propertyTable?: number;
    /** A label assigned to this feature ID set. */
    label?: string;

    // specific to babylon
    /** The kind of the vertex buffer bound to this set, on the geometry of the mesh. */
    vertexAttributeKind?: string;
    /** The texture, for a set stored in one. */
    textureData?: BaseTexture;
}

export interface IHasFeatureIds {
    featureIds: Array<IFeatureId>;
}

/** The feature IDs of the thin instances of a mesh, as `EXT_instance_features` gives them. */
export interface IHasInstanceIds extends IHasFeatureIds {
    // babylon specific
    /** One ID per thin instance, at the index of its set in `featureIds`. A set stored elsewhere has none. */
    thinInstanceIds: Array<IndicesArray | undefined>;
}

export function HasFeatureIds(b: unknown): b is IHasFeatureIds {
    if (b === null || b === undefined || typeof b !== "object") return false;
    const obj = b as Partial<IHasFeatureIds>;
    return obj.featureIds !== undefined && Array.isArray(obj.featureIds) && obj.featureIds.length != 0;
}

/** Prefix of the kind of the vertex buffers that hold feature IDs: `fid0` for the first set of a primitive. */
export const FEATURE_ID_KIND_PREFIX = "fid";

export function BuildKind(prefix: string, n: number): string {
    return `${prefix}${n}`;
}
