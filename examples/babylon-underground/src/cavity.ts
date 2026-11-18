import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** A test cavity: an icosphere deformed by low frequency noise, flattened at the floor, seen from inside. */
export interface ICavityOptions {
    /** Mean radius in metres. */
    radius: number;
    /** Vertical scale of the sphere, below 1 for a chamber wider than tall. */
    heightScale: number;
    /** Height of the flat floor below the centre, in metres. */
    floorDepth: number;
    /** Relative amplitude of the radial deformation. */
    roughness: number;
    /** Subdivisions of the icosahedron: 20 x 4^n triangles. */
    subdivisions: number;
    seed: number;
}

export const DEFAULT_CAVITY: ICavityOptions = { radius: 120, heightScale: 0.45, floorDepth: 30, roughness: 0.14, subdivisions: 6, seed: 7 };

/** Positions and indices of a unit icosphere, vertices shared, by midpoint subdivision. */
function icosphere(subdivisions: number): { positions: number[]; indices: number[] } {
    const t = (1 + Math.sqrt(5)) / 2;
    const positions: number[] = [];
    const add = (x: number, y: number, z: number): number => {
        const length = Math.hypot(x, y, z);
        positions.push(x / length, y / length, z / length);
        return positions.length / 3 - 1;
    };
    for (const [x, y, z] of [
        [-1, t, 0],
        [1, t, 0],
        [-1, -t, 0],
        [1, -t, 0],
        [0, -1, t],
        [0, 1, t],
        [0, -1, -t],
        [0, 1, -t],
        [t, 0, -1],
        [t, 0, 1],
        [-t, 0, -1],
        [-t, 0, 1],
    ] as const)
        add(x, y, z);
    // prettier-ignore
    let faces = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ];
    for (let level = 0; level < subdivisions; level++) {
        const middles = new Map<string, number>();
        const middle = (a: number, b: number): number => {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            let index = middles.get(key);
            if (index === undefined) {
                index = add(
                    positions[a * 3]! + positions[b * 3]!,
                    positions[a * 3 + 1]! + positions[b * 3 + 1]!,
                    positions[a * 3 + 2]! + positions[b * 3 + 2]!,
                );
                middles.set(key, index);
            }
            return index;
        };
        const next: number[] = [];
        for (let i = 0; i < faces.length; i += 3) {
            const [a, b, c] = [faces[i]!, faces[i + 1]!, faces[i + 2]!];
            const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
            next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
        }
        faces = next;
    }
    return { positions, indices: faces };
}

/** Seeded 3D value noise in [-1, 1], smooth, for the shape of the cavity only. */
function valueNoise(seed: number): (x: number, y: number, z: number) => number {
    const hash = (i: number, j: number, k: number): number => {
        let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ Math.imul(seed, 144665);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = (f: number): number => f * f * f * (f * (f * 6 - 15) + 10);
    const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
    return (x, y, z) => {
        const [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
        const [u, v, w] = [smooth(x - i), smooth(y - j), smooth(z - k)];
        const c = (a: number, b: number, d: number): number => hash(i + a, j + b, k + d);
        const value = lerp(
            lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
            lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
            w,
        );
        return value * 2 - 1;
    };
}

/**
 * Builds the cavity with positions, normals and indices only, in metres, normals facing inward: what the real chamber
 * mesh will provide. No UVs, no tangents.
 */
export function createCavity(scene: Scene, options: ICavityOptions = DEFAULT_CAVITY): Mesh {
    const { positions: unit, indices } = icosphere(options.subdivisions);
    const noise = valueNoise(options.seed);
    const detail = valueNoise(options.seed + 1);
    const positions: number[] = [];
    for (let i = 0; i < unit.length; i += 3) {
        const [x, y, z] = [unit[i]!, unit[i + 1]!, unit[i + 2]!];
        const deformation = 0.75 * noise(x * 1.6, y * 1.6, z * 1.6) + 0.25 * detail(x * 4.5, y * 4.5, z * 4.5);
        const r = options.radius * (1 + options.roughness * deformation);
        let py = y * r * options.heightScale;
        // Flat floor, slightly undulating.
        const floor = -options.floorDepth + 1.5 * detail(x * 3, 7.1, z * 3);
        if (py < floor) py = floor + (py - floor) * 0.04;
        positions.push(x * r, py, z * r);
    }
    // The icosahedron faces turn counter-clockwise seen from outside: in this right-handed scene, Babylon.js culls that
    // side and draws the inner one, as checked in the captures of the example.
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    // The normals must look at the centre, from where the cavity is seen, whatever the convention of ComputeNormals.
    let outward = 0;
    for (let i = 0; i < positions.length; i += 3)
        outward += positions[i]! * normals[i]! + positions[i + 1]! * normals[i + 1]! + positions[i + 2]! * normals[i + 2]!;
    if (outward > 0) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i]!;
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    const mesh = new Mesh("cavity", scene);
    data.applyToMesh(mesh);
    return mesh;
}

/** The same cavity with one normal per face, vertices unshared. */
export function createFlatCavity(source: Mesh): Mesh {
    const flat = source.clone("cavityFlat");
    flat.convertToFlatShadedMesh();
    const positions = flat.getVerticesData(VertexBuffer.PositionKind)!;
    const normals = flat.getVerticesData(VertexBuffer.NormalKind)!;
    let outward = 0;
    for (let i = 0; i < positions.length; i += 3)
        outward += positions[i]! * normals[i]! + positions[i + 1]! * normals[i + 1]! + positions[i + 2]! * normals[i + 2]!;
    if (outward > 0)
        flat.setVerticesData(
            VertexBuffer.NormalKind,
            Array.from(normals, (value) => -value),
        );
    return flat;
}
