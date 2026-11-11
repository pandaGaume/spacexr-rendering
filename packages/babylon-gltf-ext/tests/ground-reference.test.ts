import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import { GLTF2Export } from "@babylonjs/serializers/glTF/2.0/glTFSerializer.js";
import { beforeAll, describe, expect, it } from "vitest";

import { getNodePresentation, NodePresentationRuntime, setNodePresentation, type IGroundSurface, type INodePresentation } from "../src";
import { registerNodePresentationExporters } from "../src/exporter";
import { registerNodePresentationLoaders } from "../src/loader";

function createScene(): Scene {
    const scene = new Scene(
        new NullEngine({ renderWidth: 800, renderHeight: 600, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }),
    );
    scene.useRightHandedSystem = true;
    const camera = new FreeCamera("camera", new Vector3(30, 40, 120), scene);
    camera.setTarget(Vector3.Zero());
    return scene;
}

/** A node under a parent that is moved, turned and scaled, as a tile root is. */
function createNode(scene: Scene): TransformNode {
    const parent = new TransformNode("parent", scene);
    parent.position.set(100, -20, 35);
    parent.rotationQuaternion = Quaternion.FromEulerAngles(0.4, -1.1, 0.7);
    parent.scaling.setAll(3);
    const node = new TransformNode("node", scene);
    node.parent = parent;
    node.position.set(2, 1, -4);
    node.rotationQuaternion = Quaternion.FromEulerAngles(0.2, 0.3, 0.1);
    node.scaling.set(2, 2, 2);
    return node;
}

function expectVector(actual: Vector3, expected: Vector3, precision = 5): void {
    expect(actual.x).toBeCloseTo(expected.x, precision);
    expect(actual.y).toBeCloseTo(expected.y, precision);
    expect(actual.z).toBeCloseTo(expected.z, precision);
}

/** A flat ground at a height, whose vertical is the Y axis. */
function flat(height: number): IGroundSurface {
    return { project: (position, offset, result) => (result.set(position.x, height + offset, position.z), true) };
}

describe("SPACEXR_ground_reference", () => {
    it("stands the origin of the node on the ground, raised by its offset, and changes nothing else of it", () => {
        const scene = createScene();
        const node = createNode(scene);
        const authored = node.getAbsolutePosition().clone();
        const rotation = node.rotationQuaternion!.clone();
        setNodePresentation(node, { groundReference: { offset: 1.5 } });
        const runtime = new NodePresentationRuntime(scene, { ground: flat(250) });
        runtime.attach(node);

        runtime.update();

        node.computeWorldMatrix(true);
        expectVector(node.getAbsolutePosition(), new Vector3(authored.x, 251.5, authored.z));
        expect(Quaternion.Dot(node.rotationQuaternion!, rotation)).toBeCloseTo(1, 9);
        expectVector(node.scaling, new Vector3(2, 2, 2));
    });

    it("keeps the authored position where no ground is known, and reads the ground again later", () => {
        const scene = createScene();
        const node = createNode(scene);
        const authored = node.getAbsolutePosition().clone();
        setNodePresentation(node, { groundReference: {} });
        let known = false;
        const ground: IGroundSurface = {
            project: (position, _offset, result) => (known ? (result.set(position.x, 7, position.z), true) : false),
        };
        const runtime = new NodePresentationRuntime(scene, { ground, groundRefreshFrames: 1 });
        runtime.attach(node);

        runtime.update();
        node.computeWorldMatrix(true);
        expectVector(node.getAbsolutePosition(), authored);

        known = true;
        scene.render();
        node.computeWorldMatrix(true);
        expectVector(node.getAbsolutePosition(), new Vector3(authored.x, 7, authored.z));
    });

    it("leaves a disabled node alone, and gives a detached one its authored position back", () => {
        const scene = createScene();
        const node = createNode(scene);
        const position = node.position.clone();
        setNodePresentation(node, { groundReference: {} });
        const runtime = new NodePresentationRuntime(scene, { ground: flat(-60) });
        runtime.attach(node);

        node.setEnabled(false);
        runtime.update();
        expectVector(node.position, position);

        node.setEnabled(true);
        runtime.update();
        expect(node.position.equalsWithEpsilon(position, 1e-6)).toBe(false);
        runtime.detach(node);
        expectVector(node.position, position);
    });

    it("has one runtime per scene, found from it", () => {
        const scene = createScene();
        const runtime = new NodePresentationRuntime(scene);
        expect(NodePresentationRuntime.get(scene)).toBe(runtime);
        expect(() => new NodePresentationRuntime(scene)).toThrow();
        runtime.dispose();
        expect(NodePresentationRuntime.get(scene)).toBeUndefined();
    });
});

describe("SPACEXR_ground_reference in glTF", () => {
    beforeAll(() => {
        registerNodePresentationExporters();
        registerNodePresentationLoaders();
    });

    async function exportGlb(presentation: INodePresentation | undefined): Promise<Uint8Array<ArrayBuffer>> {
        const scene = createScene();
        const node = new TransformNode("collar", scene);
        node.position.set(4, 5, 6);
        const box = CreateBox("collar-box", { size: 1 }, scene);
        box.parent = node;
        setNodePresentation(node, presentation);
        const data = await GLTF2Export.GLBAsync(scene, "content");
        const blob = data.files["content.glb"];
        if (!(blob instanceof Blob)) throw new Error("No GLB was exported.");
        return new Uint8Array(await blob.arrayBuffer());
    }

    /** The JSON chunk of a GLB. */
    function documentOf(glb: Uint8Array): {
        extensionsUsed?: string[];
        extensionsRequired?: string[];
        nodes: { name?: string; extensions?: Record<string, unknown> }[];
    } {
        const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
        return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))));
    }

    it("is written on its node and listed as used, never as required", async () => {
        const document = documentOf(await exportGlb({ groundReference: { offset: 1.2 } }));

        expect(document.extensionsUsed).toEqual(["SPACEXR_ground_reference"]);
        expect(document.extensionsRequired ?? []).toEqual([]);
        expect(document.nodes.find((node) => node.name === "collar")?.extensions).toEqual({ SPACEXR_ground_reference: { offset: 1.2 } });
        expect(documentOf(await exportGlb(undefined)).extensionsUsed ?? []).toEqual([]);
    });

    it("is read back, and its node attached to the runtime of the scene", async () => {
        const glb = await exportGlb({ groundReference: {} });
        const scene = createScene();
        const runtime = new NodePresentationRuntime(scene, { ground: flat(90) });

        const container = await LoadAssetContainerAsync(glb, scene, { pluginExtension: ".glb" });
        container.addAllToScene();
        runtime.update();

        const collar = container.transformNodes.find((node) => node.name === "collar")!;
        expect(getNodePresentation(collar)).toEqual({ groundReference: { offset: 0 } });
        expect(collar.computeWorldMatrix(true).getTranslation().y).toBeCloseTo(90, 5);
    });
});
