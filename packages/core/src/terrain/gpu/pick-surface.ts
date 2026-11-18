import { Material } from "@babylonjs/core/Materials/material.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TerrainPickPatch } from "@spacexr/terrain-tileset";

/**
 * Surface Babylon picks when the terrain is displaced on the GPU, for example the `GeospatialCamera` when it drags or
 * zooms toward the cursor: one mesh, never rendered, gathering the coarse pick patches of the presented terrain tiles.
 *
 * Babylon picks meshes on the CPU, which cannot see vertices moved by a shader. The patches are built once per terrain
 * tile from its DEM (`TerrainPickPatch` of `@spacexr/terrain-tileset`); this surface only copies their positions when the
 * cut or the vertical scale changes. One mesh keeps the per-frame cost of the scene to a single entry, and one sub-mesh
 * per tile keeps Babylon's bounding test per tile before its triangles.
 *
 * Positions are relative to the centre of the finest tile, the one nearest the camera in practice, so the vertices
 * picked near the camera stay precise in 32-bit floats. Its layer mask matches no camera: picked, never drawn.
 */
export class PickSurface {
    private mesh: Mesh | undefined;
    private tiles = 0;
    /** Plain triangle material: Babylon falls back to bounding-box picking for a mesh without one. Always ready, never compiled. */
    private readonly material: Material;

    public constructor(
        private readonly scene: Scene,
        private readonly parent?: TransformNode,
    ) {
        this.material = new Material("gpu-terrain-pick", scene);
    }

    /** Terrain tiles in the pick surface. */
    public get size(): number {
        return this.tiles;
    }

    /** The mesh Babylon picks, if any tile is presented. */
    public get pickMesh(): Mesh | undefined {
        return this.mesh;
    }

    /** Gathers the patches of the presented cut, at their current vertical scale. */
    public update(patches: Iterable<TerrainPickPatch>): void {
        const list = [...patches];
        this.mesh?.dispose();
        this.mesh = undefined;
        this.tiles = list.length;
        if (list.length === 0) return;
        const origin = list.reduce((finest, patch) => (patch.address.lod > finest.address.lod ? patch : finest)).center;
        let vertexCount = 0;
        let indexCount = 0;
        for (const patch of list) {
            vertexCount += patch.positions.length / 3;
            indexCount += patch.indices.length;
        }
        const positions = new Float32Array(vertexCount * 3);
        const indices = new Uint32Array(indexCount);
        const ranges: { start: number; count: number }[] = [];
        let vertex = 0;
        let index = 0;
        for (const patch of list) {
            const dx = patch.center.x - origin.x;
            const dy = patch.center.y - origin.y;
            const dz = patch.center.z - origin.z;
            const source = patch.positions;
            for (let offset = 0; offset < source.length; offset += 3) {
                positions[vertex * 3 + offset] = source[offset]! + dx;
                positions[vertex * 3 + offset + 1] = source[offset + 1]! + dy;
                positions[vertex * 3 + offset + 2] = source[offset + 2]! + dz;
            }
            for (const value of patch.indices) indices[index++] = value + vertex;
            ranges.push({ start: index - patch.indices.length, count: patch.indices.length });
            vertex += source.length / 3;
        }
        const mesh = new Mesh("gpu-terrain-pick", this.scene);
        mesh.parent = this.parent ?? null;
        mesh.metadata = this.parent?.metadata;
        const data = new VertexData();
        data.positions = positions;
        data.indices = indices;
        data.applyToMesh(mesh, false);
        mesh.material = this.material;
        mesh.subMeshes = [];
        for (const range of ranges) SubMesh.AddToMesh(0, 0, vertexCount, range.start, range.count, mesh);
        mesh.position = new Vector3(origin.x, origin.y, origin.z);
        mesh.layerMask = 0;
        mesh.isPickable = true;
        mesh.doNotSyncBoundingInfo = false;
        this.mesh = mesh;
    }

    public dispose(): void {
        this.mesh?.dispose();
        this.mesh = undefined;
        this.tiles = 0;
        this.material.dispose();
    }
}
