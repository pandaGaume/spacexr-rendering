import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { getNodePresentation, type INodePresentation } from "./presentation";

/**
 * The ground a scene displays, as `SPACEXR_ground_reference` needs it. The application supplies it: it knows the
 * reference surface of its world, its terrain and the exaggeration of its relief.
 */
export interface IGroundSurface {
    /**
     * Writes the point of the displayed ground on the vertical of `position`, raised by `offset` metres along that
     * vertical. The vertical is the normal of the reference surface at `position`; an application that exaggerates its
     * relief applies the same factor to `offset`.
     *
     * @param position Authored position of the node origin, in the frame of the scene.
     * @returns false where no ground is displayed yet: the node then keeps its authored position.
     */
    project(position: Vector3, offset: number, result: Vector3): boolean;
}

export interface INodePresentationRuntimeOptions {
    /** The ground of the scene. Without it, ground-referenced nodes keep their authored position. */
    ground?: IGroundSurface;
    /** Frames between two readings of the ground under a node. Defaults to 30. */
    groundRefreshFrames?: number;
}

interface IEntry {
    node: TransformNode;
    presentation: INodePresentation;
    /** Local position of the node as authored, before this runtime changes it. */
    position: Vector3;
    /** Where the origin of the node stands, in the frame of its parent: authored, or on the ground. */
    anchor: Vector3;
    /** Frame of the last reading of the ground. */
    groundFrame: number;
}

const runtimes = new WeakMap<Scene, NodePresentationRuntime>();
const IDENTITY = Matrix.Identity();
const DEFAULT_GROUND_FRAMES = 30;

/**
 * Applies the presentation declared on glTF nodes, frame after frame: `SPACEXR_ground_reference` moves the origin of
 * a node onto the ground of the scene. Only the position of the node changes; its rotation, its scale and what stands
 * below it are left to whatever else presents it, a label for instance.
 *
 * A scene has at most one runtime. The loaders of this package attach the nodes they read to the runtime of the scene
 * they load into; a scene without a runtime keeps the declarations and the authored transforms.
 */
export class NodePresentationRuntime {
    /** The ground of the scene; it may be set or replaced at any time. */
    public ground: IGroundSurface | undefined;
    private readonly entries = new Map<TransformNode, IEntry>();
    private readonly groundFrames: number;
    private observer: Observer<Camera> | null;

    /** The runtime of a scene, when it has one. */
    public static get(scene: Scene): NodePresentationRuntime | undefined {
        return runtimes.get(scene);
    }

    public constructor(
        private readonly scene: Scene,
        options: INodePresentationRuntimeOptions = {},
    ) {
        if (runtimes.has(scene)) throw new Error("This scene already has a node presentation runtime.");
        this.ground = options.ground;
        this.groundFrames = Math.max(1, options.groundRefreshFrames ?? DEFAULT_GROUND_FRAMES);
        this.observer = scene.onBeforeCameraRenderObservable.add(() => this.update());
        scene.onDisposeObservable.addOnce(() => this.dispose());
        runtimes.set(scene, this);
    }

    /** Starts applying the presentation declared on a node. A node without a declaration is left alone. */
    public attach(node: TransformNode): void {
        const presentation = getNodePresentation(node);
        this.detach(node);
        if (!presentation) return;
        this.entries.set(node, {
            node,
            presentation,
            position: node.position.clone(),
            anchor: node.position.clone(),
            groundFrame: -Infinity,
        });
        node.onDisposeObservable.addOnce(() => this.entries.delete(node));
    }

    /** Stops applying the presentation of a node and gives it back its authored position. */
    public detach(node: TransformNode): void {
        const entry = this.entries.get(node);
        if (!entry) return;
        this.entries.delete(node);
        if (!node.isDisposed()) node.position.copyFrom(entry.position);
    }

    /**
     * Applies the presentations. The runtime calls it before each camera renders; an application that renders outside
     * the render loop of the scene may call it itself.
     */
    public update(): void {
        const frame = this.scene.getFrameId();
        for (const entry of this.entries.values()) {
            const node = entry.node;
            if (node.isDisposed()) {
                this.entries.delete(node);
                continue;
            }
            if (!node.isEnabled()) continue;
            this.stand(entry, node.parent ? node.parent.getWorldMatrix() : IDENTITY, frame);
            node.position.copyFrom(entry.anchor);
        }
    }

    public dispose(): void {
        if (this.observer) this.scene.onBeforeCameraRenderObservable.remove(this.observer);
        this.observer = null;
        this.entries.clear();
        if (runtimes.get(this.scene) === this) runtimes.delete(this.scene);
    }

    /** Finds where the origin of a node stands: on the ground, or where it was authored while no ground is known. */
    private stand(entry: IEntry, parentWorld: Matrix, frame: number): void {
        if (frame - entry.groundFrame < this.groundFrames) return;
        entry.groundFrame = frame;
        const authored = Vector3.TransformCoordinates(entry.position, parentWorld);
        const grounded = new Vector3();
        if (this.ground?.project(authored, entry.presentation.groundReference?.offset ?? 0, grounded))
            Vector3.TransformCoordinatesToRef(grounded, parentWorld.clone().invert(), entry.anchor);
        else entry.anchor.copyFrom(entry.position);
    }
}
