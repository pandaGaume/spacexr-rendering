import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import { beforeAll, describe, expect, it } from "vitest";

import {
    findStructuralMetadata,
    getInstanceFeature,
    getMeshFeature,
    HasFeatureIds,
    IsHasStructuralMetadata,
    readPropertyTable,
    type IHasInstanceIds,
    type IMetadataPropertyTable,
    type IMetadataSchema,
} from "../src";
import { registerFeatureMetadataLoaders } from "../src/gltf/features/loaders";

/** Collects the buffer views of a glTF buffer, each aligned on 8 bytes. */
class BufferBuilder {
    public readonly views: { buffer: 0; byteOffset: number; byteLength: number; byteStride?: number }[] = [];
    private readonly chunks: Uint8Array[] = [];
    private length = 0;

    public add(data: ArrayBufferView, byteStride?: number): number {
        const padding = (8 - (this.length % 8)) % 8;
        if (padding) this.chunks.push(new Uint8Array(padding));
        this.length += padding;
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        this.chunks.push(bytes);
        this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.length, ...(byteStride ? { byteStride } : {}) });
        this.length += bytes.length;
        return this.views.length - 1;
    }

    public bytes(): Uint8Array {
        const merged = new Uint8Array(this.length);
        let offset = 0;
        for (const chunk of this.chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        return merged;
    }
}

/** A GLB of a glTF document and its binary buffer. */
function createGlb(document: unknown, bin: Uint8Array): Uint8Array {
    const json = new TextEncoder().encode(JSON.stringify(document));
    const jsonLength = Math.ceil(json.length / 4) * 4;
    const binLength = Math.ceil(bin.length / 4) * 4;
    const glb = new Uint8Array(28 + jsonLength + binLength);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.length, true);
    view.setUint32(12, jsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.fill(0x20, 20, 20 + jsonLength);
    glb.set(json, 20);
    view.setUint32(20 + jsonLength, binLength, true);
    view.setUint32(24 + jsonLength, 0x004e4942, true);
    glb.set(bin, 28 + jsonLength);
    return glb;
}

/** The feature IDs of a triangle: an unsigned short per vertex, in 4 bytes as glTF aligns vertex data. */
function featureIds(id: number): Uint8Array {
    const data = new Uint8Array(12);
    for (let vertex = 0; vertex < 3; vertex++) new DataView(data.buffer).setUint16(vertex * 4, id, true);
    return data;
}

const SCHEMA: IMetadataSchema = {
    id: "test_schema",
    classes: {
        Thing: {
            properties: {
                identifier: { type: "STRING", required: true },
                level: { type: "SCALAR", componentType: "UINT8" },
                grade: { type: "SCALAR", componentType: "FLOAT32" },
                share: { type: "SCALAR", componentType: "UINT8", normalized: true },
                active: { type: "BOOLEAN" },
                kind: { type: "ENUM", enumType: "Kind" },
                aliases: { type: "STRING", array: true },
            },
        },
    },
    enums: {
        Kind: {
            valueType: "UINT8",
            values: [
                { name: "ore", value: 0 },
                { name: "waste", value: 1 },
            ],
        },
    },
};

/**
 * A glTF of three triangles: `first` and `second` belong to the features 0 and 1 of a property table, the first one
 * indexed; `implicit` has a set of feature IDs without an attribute.
 */
function createContent(schema: "embedded" | "uri"): Uint8Array {
    const buffer = new BufferBuilder();
    const positions = buffer.add(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const indices = buffer.add(new Uint16Array([0, 1, 2]));
    const ids = [buffer.add(featureIds(0), 4), buffer.add(featureIds(1), 4)];
    const text = new TextEncoder();
    const table: IMetadataPropertyTable = {
        class: "Thing",
        count: 2,
        properties: {
            identifier: { values: buffer.add(text.encode("alphabeta")), stringOffsets: buffer.add(new Uint32Array([0, 5, 9])) },
            level: { values: buffer.add(new Uint8Array([3, 7])) },
            grade: { values: buffer.add(new Float32Array([0.5, 1.5])), scale: 2, offset: 1 },
            share: { values: buffer.add(new Uint8Array([255, 51])) },
            active: { values: buffer.add(new Uint8Array([0b01])) },
            kind: { values: buffer.add(new Uint8Array([1, 0])) },
            aliases: {
                values: buffer.add(text.encode("ab")),
                stringOffsets: buffer.add(new Uint32Array([0, 1, 2])),
                arrayOffsets: buffer.add(new Uint32Array([0, 1, 2])),
            },
        },
    };
    const position = { bufferView: positions, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] };
    const featured = (accessor: number, indexed: boolean) => ({
        primitives: [
            {
                attributes: { POSITION: 0, _FEATURE_ID_0: accessor },
                ...(indexed ? { indices: 1 } : {}),
                extensions: { EXT_mesh_features: { featureIds: [{ featureCount: 1, attribute: 0, propertyTable: 0 }] } },
            },
        ],
    });
    const document = {
        asset: { version: "2.0" },
        extensionsUsed: ["EXT_mesh_features", "EXT_structural_metadata"],
        extensions: {
            EXT_structural_metadata: {
                ...(schema === "embedded" ? { schema: SCHEMA } : { schemaUri: "schema.json" }),
                propertyTables: [table],
            },
        },
        scene: 0,
        scenes: [{ nodes: [0, 1, 2] }],
        nodes: [
            { name: "first", mesh: 0 },
            { name: "second", mesh: 1 },
            { name: "implicit", mesh: 2 },
        ],
        meshes: [
            featured(2, true),
            featured(3, false),
            { primitives: [{ attributes: { POSITION: 0 }, extensions: { EXT_mesh_features: { featureIds: [{ featureCount: 3 }] } } }] },
        ],
        accessors: [
            position,
            { bufferView: indices, componentType: 5123, count: 3, type: "SCALAR" },
            { bufferView: ids[0], componentType: 5123, count: 3, type: "SCALAR" },
            { bufferView: ids[1], componentType: 5123, count: 3, type: "SCALAR" },
        ],
        bufferViews: buffer.views,
        buffers: [{ byteLength: buffer.bytes().length }],
    };
    return createGlb(document, buffer.bytes());
}

async function load(schema: "embedded" | "uri"): Promise<{ root: AbstractMesh; mesh: (name: string) => AbstractMesh }> {
    const scene = new Scene(
        new NullEngine({ renderWidth: 800, renderHeight: 600, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }),
    );
    scene.useRightHandedSystem = true;
    const container = await LoadAssetContainerAsync(createContent(schema), scene, { pluginExtension: ".glb" });
    const mesh = (name: string): AbstractMesh => {
        const found = container.meshes.find((item) => item.name === name);
        if (!found) throw new Error(`No mesh named ${name}.`);
        return found;
    };
    return { root: container.meshes[0]!, mesh };
}

describe("EXT_mesh_features", () => {
    beforeAll(() => registerFeatureMetadataLoaders());

    it("keeps the sets of a primitive on its mesh and loads their attribute as a vertex buffer", async () => {
        const { mesh } = await load("embedded");
        const first = mesh("first");

        expect(HasFeatureIds(first)).toBe(true);
        if (!HasFeatureIds(first)) return;
        expect(first.featureIds).toHaveLength(1);
        expect(first.featureIds[0]).toMatchObject({ featureCount: 1, attribute: 0, propertyTable: 0, vertexAttributeKind: "fid0" });
        expect(Array.from(first.getVerticesData("fid0")!)).toEqual([0, 0, 0]);
        expect(Array.from(mesh("second").getVerticesData("fid0")!)).toEqual([1, 1, 1]);
        // The geometry is the one the loader builds without the extension.
        expect(first.getTotalVertices()).toBe(3);
        expect(Array.from(first.getIndices()!)).toEqual([0, 1, 2]);
    });

    it("gives a vertex its index as feature ID in an implicit set", async () => {
        const { mesh } = await load("embedded");
        const implicit = mesh("implicit");

        expect(HasFeatureIds(implicit) && implicit.featureIds[0]!.vertexAttributeKind).toBe("fid0");
        expect(Array.from(implicit.getVerticesData("fid0")!)).toEqual([0, 1, 2]);
        expect(getMeshFeature(implicit, 0)).toEqual({ featureId: 0, featureIdSet: 0 });
    });
});

describe("EXT_structural_metadata", () => {
    beforeAll(() => registerFeatureMetadataLoaders());

    it("keeps the metadata of the asset on its root and reads the columns of its property tables", async () => {
        const { root, mesh } = await load("embedded");

        expect(IsHasStructuralMetadata(root)).toBe(true);
        const metadata = findStructuralMetadata(mesh("second"))!;
        expect(metadata.schema?.id).toBe("test_schema");
        const table = metadata.propertyTables![0]!;
        expect(table.values!.identifier).toEqual(["alpha", "beta"]);
        expect(table.values!.level).toEqual([3, 7]);
        // The scale and the offset of the table apply to the stored values.
        expect(table.values!.grade).toEqual([2, 4]);
        expect((table.values!.share as number[]).map((value) => +value.toFixed(3))).toEqual([1, 0.2]);
        expect(table.values!.active).toEqual([true, false]);
        expect(table.values!.kind).toEqual(["waste", "ore"]);
        // An array property is not read.
        expect(table.values!.aliases).toBeUndefined();
    });

    it("gives the feature of a picked face: its row of the property table", async () => {
        const { mesh } = await load("embedded");

        expect(getMeshFeature(mesh("first"), 0)).toEqual({
            featureId: 0,
            featureIdSet: 0,
            propertyTable: 0,
            class: "Thing",
            properties: { identifier: "alpha", level: 3, grade: 2, share: 1, active: true, kind: "waste" },
        });
        expect(getMeshFeature(mesh("second"), 0)?.properties?.identifier).toBe("beta");
    });

    it("gives no feature to a face that carries the null feature ID", async () => {
        const { mesh } = await load("embedded");
        const second = mesh("second");
        if (HasFeatureIds(second)) second.featureIds[0]!.nullFeatureId = 1;

        expect(getMeshFeature(second, 0)).toBeUndefined();
    });

    it("leaves the tables unread when the schema is not embedded", async () => {
        const { mesh } = await load("uri");

        const metadata = findStructuralMetadata(mesh("first"))!;
        expect(metadata.schemaUri).toBe("schema.json");
        expect(metadata.propertyTables![0]!.values).toBeUndefined();
        expect(getMeshFeature(mesh("first"), 0)).toEqual({ featureId: 0, featureIdSet: 0, propertyTable: 0, class: "Thing" });
    });
});

describe("EXT_instance_features", () => {
    beforeAll(() => registerFeatureMetadataLoaders());

    /** A triangle drawn three times by `EXT_mesh_gpu_instancing`, the instances belonging to the features 1, 0 and 1. */
    function createInstances(): Uint8Array {
        const buffer = new BufferBuilder();
        const positions = buffer.add(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
        const translations = buffer.add(new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]));
        const ids = buffer.add(new Uint16Array([1, 0, 1]));
        const text = new TextEncoder();
        const table: IMetadataPropertyTable = {
            class: "Thing",
            count: 2,
            properties: {
                identifier: { values: buffer.add(text.encode("pineoak")), stringOffsets: buffer.add(new Uint32Array([0, 4, 7])) },
            },
        };
        const document = {
            asset: { version: "2.0" },
            extensionsUsed: ["EXT_mesh_gpu_instancing", "EXT_instance_features", "EXT_structural_metadata"],
            extensions: { EXT_structural_metadata: { schema: SCHEMA, propertyTables: [table] } },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [
                {
                    name: "trees",
                    mesh: 0,
                    extensions: {
                        EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1, _FEATURE_ID_0: 2 } },
                        EXT_instance_features: { featureIds: [{ featureCount: 2, attribute: 0, propertyTable: 0 }] },
                    },
                },
            ],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
            accessors: [
                { bufferView: positions, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
                { bufferView: translations, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: ids, componentType: 5123, count: 3, type: "SCALAR" },
            ],
            bufferViews: buffer.views,
            buffers: [{ byteLength: buffer.bytes().length }],
        };
        return createGlb(document, buffer.bytes());
    }

    it("keeps the feature IDs of the thin instances of a node, and gives the feature of a picked instance", async () => {
        const scene = new Scene(
            new NullEngine({ renderWidth: 800, renderHeight: 600, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }),
        );
        scene.useRightHandedSystem = true;
        const container = await LoadAssetContainerAsync(createInstances(), scene, { pluginExtension: ".glb" });
        const trees = container.meshes.find((mesh) => mesh.name === "trees")!;

        expect(HasFeatureIds(trees)).toBe(true);
        expect((trees as unknown as { thinInstanceCount: number }).thinInstanceCount).toBe(3);
        const instanceIds = (trees as unknown as IHasInstanceIds).thinInstanceIds;
        expect(Array.from(instanceIds[0]!)).toEqual([1, 0, 1]);
        expect(getInstanceFeature(trees, 0)).toEqual({
            featureId: 1,
            featureIdSet: 0,
            propertyTable: 0,
            class: "Thing",
            properties: { identifier: "oak" },
        });
        expect(getInstanceFeature(trees, 1)?.properties).toEqual({ identifier: "pine" });
        // The IDs are those of the instances: a face of the mesh names no feature.
        expect(getMeshFeature(trees, 0)).toBeUndefined();
        expect(getInstanceFeature(trees, 7)).toBeUndefined();
    });
});

describe("readPropertyTable", () => {
    it("reads wide integers, and reports the properties it leaves", async () => {
        const schema: IMetadataSchema = {
            id: "wide",
            classes: {
                Wide: {
                    properties: {
                        serial: { type: "SCALAR", componentType: "UINT64" },
                        depth: { type: "SCALAR", componentType: "INT16" },
                        normal: { type: "VEC3", componentType: "FLOAT32" },
                    },
                },
            },
        };
        const views = [new BigUint64Array([2n ** 40n, 7n]), new Int16Array([-120, 300]), new Float32Array(6)];
        const table: IMetadataPropertyTable = {
            class: "Wide",
            count: 2,
            properties: { serial: { values: 0 }, depth: { values: 1 }, normal: { values: 2 }, unknown: { values: 2 } },
        };

        const columns = await readPropertyTable(table, schema, async (index) => new Uint8Array(views[index]!.buffer));

        expect(columns.values.serial).toEqual([2n ** 40n, 7n]);
        expect(columns.values.depth).toEqual([-120, 300]);
        expect(columns.skipped.sort()).toEqual(["normal", "unknown"]);
    });
});
