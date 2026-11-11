import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { ITextureInfo } from "@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js";

import type { IProperty } from "./ext-mesh-features.types";

// Ported from SpaceXR (packages/dev/babylon/src/tiles/3d/babylon/gltf/2.0/extensions, branch tile3D): the objects of
// EXT_structural_metadata as the glTF document holds them, with what the loader adds for Babylon.js.

export interface IMetadataItem extends IProperty {
    /** The name of the item, primarily used for display purposes. */
    name?: string;
    /** A textual description of the item. */
    description?: string;
}

/** The type of the elements of a property, or of a property that is not an array. */
export type MetadataPropertyType = "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4" | "STRING" | "BOOLEAN" | "ENUM";
export type MetadataComponentType = "INT8" | "UINT8" | "INT16" | "UINT16" | "INT32" | "UINT32" | "INT64" | "UINT64" | "FLOAT32" | "FLOAT64";

/** A property of a class of the schema. */
export interface IMetadataClassProperty extends IMetadataItem {
    type: MetadataPropertyType;
    /** The datatype of the components of a numeric type. */
    componentType?: MetadataComponentType;
    /** Enum ID, required when `type` is `ENUM`. */
    enumType?: string;
    /** Whether the property is an array. */
    array?: boolean;
    /** Number of elements of a fixed-length array. */
    count?: number;
    /** Whether integer values are normalized. */
    normalized?: boolean;
    offset?: number | number[];
    scale?: number | number[];
    required?: boolean;
    noData?: unknown;
    default?: unknown;
    semantic?: string;
}

export interface IMetadataClass extends IMetadataItem {
    /** The properties of the class, by property ID. */
    properties: {
        [key: string]: IMetadataClassProperty;
    };
}

export type IMetadataEnumType = "INT8" | "UINT8" | "INT16" | "UINT16" | "INT32" | "UINT32" | "INT64" | "UINT64";

/** A single value of an enumeration. */
export interface IMetadataEnumValue {
    name: string;
    value: number;
}

/** An enumeration of the schema. */
export interface IMetadataEnum extends IMetadataItem {
    /** The type of the integer enum value. Defaults to UINT16. */
    valueType?: IMetadataEnumType;
    /** The values of the enum: no duplicate names, no duplicate integer values. */
    values: Array<IMetadataEnumValue>;
}

/** The schema of EXT_structural_metadata: its classes and its enums. */
export interface IMetadataSchema extends IMetadataItem {
    /** Unique identifier of the schema. */
    id: string;
    /** Application-specific version of the schema. */
    version?: string;
    classes?: {
        [key: string]: IMetadataClass;
    };
    enums?: {
        [key: string]: IMetadataEnum;
    };
}

/** A value of a property table once read: a string, a number, a boolean or the name of an enum value. */
export type MetadataValue = string | number | bigint | boolean;

/** A property table: properties conforming to a class, stored in binary columnar arrays. */
export interface IMetadataPropertyTable extends IProperty {
    /** The name of the property table, primarily used for display purposes. */
    name?: string;
    /** The class that property values conform to. */
    class: string;
    /** The number of elements in each property array. */
    count: number;
    /** The columns, by the ID of their property in the class. */
    properties: {
        [key: string]: IMetadataPropertyTableProperty;
    };

    // babylon specific
    /** The columns once read, one value per feature. A column this package does not read is absent. */
    values?: {
        [key: string]: MetadataValue[];
    };
}

export type IMetadataOffsetType = "UINT8" | "UINT16" | "UINT32" | "UINT64";

/** A property of a property table: an array of binary property values. */
export interface IMetadataPropertyTableProperty extends IProperty {
    /** The index of the buffer view containing property values. */
    values: number;
    /** The index of the buffer view containing offsets for variable-length arrays. */
    arrayOffsets?: number;
    /** The index of the buffer view containing offsets for strings. */
    stringOffsets?: number;
    /** The type of values in `arrayOffsets`. Defaults to UINT32. */
    arrayOffsetType?: IMetadataOffsetType;
    /** The type of values in `stringOffsets`. Defaults to UINT32. */
    stringOffsetType?: IMetadataOffsetType;
    /** An offset to apply to property values. */
    offset?: number;
    /** A scale to apply to property values. */
    scale?: number;
    /** Maximum value present in the property values. */
    max?: number;
    /** Minimum value present in the property values. */
    min?: number;
}

/** A property attribute: properties conforming to a class, stored in vertex attributes. */
export interface IMetadataPropertyAttribute extends IProperty {
    name?: string;
    class: string;
    properties: {
        [key: string]: IMetadataPropertyAttributeProperty;
    };
}

/** A property of a property attribute: the attribute containing its values. */
export interface IMetadataPropertyAttributeProperty extends IProperty {
    /** The name of the attribute containing property values. */
    attribute: string;
    offset?: number;
    scale?: number;
    max?: number;
    min?: number;
}

/** A property texture: properties conforming to a class, stored in textures. */
export interface IMetadataPropertyTexture extends IProperty {
    name?: string;
    class: string;
    properties: {
        [key: string]: IMetadataPropertyTextureProperty;
    };

    // babylon specific
    textures?: {
        [key: string]: BaseTexture;
    };
}

/** A property of a property texture: the texture containing its values. */
export interface IMetadataPropertyTextureProperty extends ITextureInfo {
    /** Texture channels containing property values, in little-endian order. Defaults to [0]. */
    channels?: number[];
    offset?: number;
    scale?: number;
    max?: number;
    min?: number;
}

/** What a primitive names of the structural metadata of its asset. */
export interface IMetadataPrimitiveIndex {
    propertyAttributes?: Array<number>;
    propertyTextures?: Array<number>;
}

/** The structural metadata of an asset, as the loader attaches it to the root of what it loads. */
export interface IStructuralMetadata {
    /** The schema, when the asset embeds it. */
    schema?: IMetadataSchema;
    /** The address of the schema, when the asset refers to it: it is not read here. */
    schemaUri?: string;
    propertyTables?: Array<IMetadataPropertyTable>;
    propertyAttributes?: Array<IMetadataPropertyAttribute>;
    propertyTextures?: Array<IMetadataPropertyTexture>;
}

export interface IHasStructuralMetadata {
    structuralMetadata?: IStructuralMetadata;
}

export function IsStructuralMetadata(b: unknown): b is IStructuralMetadata {
    if (b === null || b === undefined || typeof b !== "object") return false;
    const obj = b as Partial<IStructuralMetadata>;
    return obj.schema !== undefined || obj.schemaUri !== undefined;
}

export function IsHasStructuralMetadata(b: unknown): b is Required<IHasStructuralMetadata> {
    if (b === null || b === undefined || typeof b !== "object") return false;
    return (b as IHasStructuralMetadata).structuralMetadata !== undefined;
}
