import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** Scientific colours the rock must not swallow: a saturated blue and a saturated orange. */
export const TEST_BLUE = Color3.FromHexString("#2f7dff");
export const TEST_ORANGE = Color3.FromHexString("#ff7a1a");

function emissive(name: string, colour: Color3, scene: Scene): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    material.albedoColor = colour.toLinearSpace();
    material.emissiveColor = colour.toLinearSpace().scale(0.6);
    material.metallic = 0;
    material.roughness = 0.45;
    return material;
}

/**
 * Drill hole tubes and a blob in front of a wall point, along the wall: blue and orange, partly emissive, casting
 * shadows on the rock.
 *
 * @param anchor - A point on the wall.
 * @param normal - Unit normal of the wall there, into the cavity.
 */
export function createTestObjects(scene: Scene, anchor: Vector3, normal: Vector3): Mesh[] {
    const blue = emissive("testBlue", TEST_BLUE, scene);
    const orange = emissive("testOrange", TEST_ORANGE, scene);
    const side = Vector3.Cross(normal, Vector3.Up()).normalize();
    const up = Vector3.Cross(side, normal).normalize();
    const at = (along: number, height: number, out: number): Vector3 =>
        anchor.add(side.scale(along)).add(up.scale(height)).add(normal.scale(out));

    const meshes: Mesh[] = [];
    // Drill holes: straight tubes leaving the wall at an angle, of several diameters and lengths.
    const holes: [Vector3, Vector3, number, PBRMaterial][] = [
        [at(-0.6, 0.4, -0.5), at(-0.2, 0.7, 1.4), 0.04, blue],
        [at(0.5, -0.2, -0.5), at(1.1, -0.1, 1.2), 0.04, orange],
        [at(-6, 2, -1), at(-3, 5, 9), 0.25, blue],
        [at(5, -1, -1), at(9, 1, 8), 0.25, orange],
        [at(-30, 8, -2), at(-18, 14, 35), 1.2, orange],
        [at(26, -4, -2), at(20, 6, 40), 1.2, blue],
    ];
    holes.forEach(([from, to, radius, material], index) => {
        const tube = CreateTube(`drillHole${index}`, { path: [from, to], radius, tessellation: 16, cap: 3 }, scene);
        tube.material = material;
        meshes.push(tube);
    });
    // A blob: a deformed sphere standing off the wall.
    const blob = CreateIcoSphere("blob", { radius: 1, subdivisions: 4 }, scene);
    const positions = blob.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
        const [x, y, z] = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
        const s = 1 + 0.25 * Math.sin(3 * x + 1) * Math.sin(2 * y + 2) * Math.sin(2.5 * z);
        positions[i] = x * s * 1.6;
        positions[i + 1] = y * s;
        positions[i + 2] = z * s * 1.2;
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, blob.getIndices()!, normals);
    blob.setVerticesData(VertexBuffer.PositionKind, positions);
    blob.setVerticesData(VertexBuffer.NormalKind, normals);
    blob.position = at(2.5, 1.2, 2.2);
    blob.material = orange;
    meshes.push(blob);
    const blob2 = blob.clone("blobFar");
    blob2.scaling.setAll(4);
    blob2.position = at(-12, -2, 10);
    blob2.material = blue;
    meshes.push(blob2);
    return meshes;
}
