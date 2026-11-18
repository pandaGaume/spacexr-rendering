/** Deterministic random numbers in [0, 1) from a 32-bit seed: SplitMix32. The same seed always gives the same sequence. */
export function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x9e3779b9) >>> 0;
        let z = state;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
        z = (z ^ (z >>> 16)) >>> 0;
        return z / 4294967296;
    };
}

/** A 3 x 3 rotation, as its three columns. */
export type RotationColumns = [[number, number, number], [number, number, number], [number, number, number]];

/** A uniformly distributed rotation from three random numbers: Shoemake, "Uniform random rotations", 1992. */
export function randomRotation(random: () => number): RotationColumns {
    const u1 = random();
    const u2 = random() * 2 * Math.PI;
    const u3 = random() * 2 * Math.PI;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    const [x, y, z, w] = [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
        [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
        [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
    ];
}
