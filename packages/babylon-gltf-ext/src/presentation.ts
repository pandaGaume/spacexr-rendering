import type { Node } from "@babylonjs/core/node.js";

/** Name of the extension that places a node relative to the displayed ground. */
export const SPACEXR_GROUND_REFERENCE = "SPACEXR_ground_reference";

/** `SPACEXR_ground_reference` of a node: its origin stands on the ground the client displays. */
export interface ISpaceXrGroundReference {
    /** Height of the origin above the ground, in metres, along the vertical of the place. Defaults to 0. */
    offset?: number;
}

/** What the node extensions of this package declare on a node. */
export interface INodePresentation {
    groundReference?: ISpaceXrGroundReference;
}

const presentations = new WeakMap<Node, INodePresentation>();

/** The presentation declared on a node, by a loader or by the application. */
export function getNodePresentation(node: Node): INodePresentation | undefined {
    return presentations.get(node);
}

/**
 * Declares the presentation of a node, or removes it. The declaration is data: the exporters write it, and a
 * {@link NodePresentationRuntime} applies it to the nodes attached to it.
 */
export function setNodePresentation(node: Node, presentation: INodePresentation | undefined): void {
    if (presentation?.groundReference) presentations.set(node, presentation);
    else presentations.delete(node);
}

/** Reads a `SPACEXR_ground_reference` object. Throws when a property has the wrong type. */
export function parseSpaceXrGroundReference(value: unknown): ISpaceXrGroundReference {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`${SPACEXR_GROUND_REFERENCE} must be an object.`);
    const offset = (value as Record<string, unknown>).offset;
    if (offset === undefined) return {};
    if (typeof offset !== "number" || !Number.isFinite(offset)) throw new Error("offset must be a finite number.");
    return { offset };
}
