import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D.js";
import { ToHalfFloat } from "@babylonjs/core/Misc/halfFloat.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * The noise of a rock face, baked into a texture.
 *
 * The relief per pixel is a sum of octaves of one 3D value noise with its gradient. Computed in the shader, each
 * octave hashes the eight corners of a cell with integer arithmetic, which is most of what an image of the rock
 * costs, and more than a mobile headset has to give. Baked, the same noise is read from a 3D texture: one read an
 * octave. The texture repeats, so the noise does: every `cells` cells of its lattice, which is `cells` wavelengths
 * of an octave.
 */

/** The baked noise a rock face reads: the texture, and what its lattice is made of. */
export interface IRockFaceNoise {
    /** A 3D texture that repeats, the noise in its red channel and its gradient in the three others. */
    texture: BaseTexture;
    /** Cells of the lattice of the noise along each axis: the noise repeats after them. */
    cells: number;
    /** Texels in a cell along each axis. */
    samples: number;
}

/** What `bakeRockNoise` is asked for. */
export interface IRockNoiseOptions {
    /** Cells of the lattice along each axis, a power of two; 32 by default. */
    cells?: number;
    /** Texels in a cell along each axis; 4 by default. */
    samples?: number;
}

/** Cells of the lattice of the baked noise along each axis: an octave of 5 m repeats every 160 m. */
export const ROCK_NOISE_CELLS = 32;
/** Texels in a cell of the baked noise: the texture is 128 texels a side, 16 MB in half floats. */
export const ROCK_NOISE_SAMPLES = 4;

/** The hash of the shader (`rfPcg`, its x), on unsigned 32 bit integers: a value in [0, 1]. */
function hash(i: number, j: number, k: number): number {
    let x = (Math.imul(i, 1664525) + 1013904223) >>> 0,
        y = (Math.imul(j, 1664525) + 1013904223) >>> 0,
        z = (Math.imul(k, 1664525) + 1013904223) >>> 0;
    x = (x + Math.imul(y, z)) >>> 0;
    y = (y + Math.imul(z, x)) >>> 0;
    z = (z + Math.imul(x, y)) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    y = (y ^ (y >>> 16)) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    x = (x + Math.imul(y, z)) >>> 0;
    return x / 4294967295;
}

/**
 * The noise of the shader (`rfNoise`) on a lattice that repeats after `cells` cells: its value in [-1, 1] and its
 * gradient, at a point given in cells. The corners of a cell are joined by a quintic, so the gradient is continuous.
 */
export function rockNoiseAt(x: number, y: number, z: number, cells: number = ROCK_NOISE_CELLS): [number, number, number, number] {
    const wrap = (value: number): number => ((value % cells) + cells) % cells;
    const i = Math.floor(x),
        j = Math.floor(y),
        k = Math.floor(z);
    const fx = x - i,
        fy = y - j,
        fz = z - k;
    const fade = (f: number): number => f * f * f * (f * (f * 6 - 15) + 10);
    const slope = (f: number): number => 30 * f * f * (f * (f - 2) + 1);
    const ux = fade(fx),
        uy = fade(fy),
        uz = fade(fz);
    const corner = (di: number, dj: number, dk: number): number => hash(wrap(i + di), wrap(j + dj), wrap(k + dk));
    const a = corner(0, 0, 0),
        b = corner(1, 0, 0),
        c = corner(0, 1, 0),
        d = corner(1, 1, 0);
    const e = corner(0, 0, 1),
        g = corner(1, 0, 1),
        h = corner(0, 1, 1),
        l = corner(1, 1, 1);
    const k1 = b - a,
        k2 = c - a,
        k3 = e - a,
        k4 = a - b - c + d,
        k5 = a - c - e + h,
        k6 = a - b - e + g,
        k7 = -a + b + c - d + e - g - h + l;
    const value = a + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz;
    return [
        2 * value - 1,
        2 * slope(fx) * (k1 + k4 * uy + k6 * uz + k7 * uy * uz),
        2 * slope(fy) * (k2 + k5 * uz + k4 * ux + k7 * uz * ux),
        2 * slope(fz) * (k3 + k6 * ux + k5 * uy + k7 * ux * uy),
    ];
}

/**
 * Bakes the noise: `cells * samples` texels a side, four numbers each (the value, then the gradient in cells), the
 * texel `i` of an axis holding the noise at `i / samples` cells. Read with linear filtering at
 * `(x * samples + 0.5) / (cells * samples)` it gives the noise at `x` cells, within what a line between two samples
 * leaves out of the quintic.
 */
export function bakeRockNoise(options: IRockNoiseOptions = {}): { data: Float32Array; size: number; cells: number; samples: number } {
    const cells = options.cells ?? ROCK_NOISE_CELLS,
        samples = options.samples ?? ROCK_NOISE_SAMPLES;
    if (!Number.isInteger(cells) || cells < 2 || (cells & (cells - 1)) !== 0)
        throw new RangeError("The lattice of a rock noise has a power of two of cells, two at least.");
    if (!Number.isInteger(samples) || samples < 1) throw new RangeError("A rock noise has one texel a cell at least.");
    const size = cells * samples;
    if (size > 256) throw new RangeError("A rock noise of more than 256 texels a side is refused: it would take over 130 MB.");
    const data = new Float32Array(size * size * size * 4);
    let at = 0;
    for (let k = 0; k < size; k++)
        for (let j = 0; j < size; j++)
            for (let i = 0; i < size; i++) {
                const [value, gx, gy, gz] = rockNoiseAt(i / samples, j / samples, k / samples, cells);
                data[at++] = value;
                data[at++] = gx;
                data[at++] = gy;
                data[at++] = gz;
            }
    return { data, size, cells, samples };
}

/**
 * The baked noise as a 3D texture, in half floats, that repeats and is read with linear filtering: what
 * `createRockFaceMaterial` and `RockFacePlugin` take as `noise`. One texture serves every rock face of a scene.
 * WebGL 2 only.
 */
export function createRockNoiseTexture(scene: Scene, options: IRockNoiseOptions = {}): IRockFaceNoise {
    const { data, size, cells, samples } = bakeRockNoise(options);
    const half = new Uint16Array(data.length);
    for (let at = 0; at < data.length; at++) half[at] = ToHalfFloat(data[at]!);
    const texture = new RawTexture3D(
        half,
        size,
        size,
        size,
        Constants.TEXTUREFORMAT_RGBA,
        scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_HALF_FLOAT,
    );
    texture.name = "rock noise";
    texture.wrapU = texture.wrapV = texture.wrapR = Constants.TEXTURE_WRAP_ADDRESSMODE;
    return { texture, cells, samples };
}
