import { describe, expect, it } from "vitest";

import { bakeRockNoise, ROCK_NOISE_CELLS, ROCK_NOISE_SAMPLES, rockNoiseAt } from "../src";

describe("rock noise", () => {
    it("repeats after its cells, value and gradient", () => {
        for (const [x, y, z] of [
            [0.3, 1.7, 2.2],
            [5.9, 0.1, 7.5],
            [3.5, 3.5, 3.5],
        ] as const) {
            const here = rockNoiseAt(x, y, z, 8);
            const there = rockNoiseAt(x + 8, y - 8, z + 16, 8);
            for (let part = 0; part < 4; part++) expect(there[part]).toBeCloseTo(here[part]!, 9);
        }
        // Not sooner: the lattice of 8 cells is not one of 4.
        expect(rockNoiseAt(0.3, 1.7, 2.2, 8)[0]).not.toBeCloseTo(rockNoiseAt(4.3, 1.7, 2.2, 8)[0], 3);
    });

    it("stays in [-1, 1] and gives the gradient of its value", () => {
        const step = 1e-5;
        let low = Infinity,
            high = -Infinity;
        for (let n = 0; n < 400; n++) {
            const x = (n * 0.731) % 32,
                y = (n * 1.137) % 32,
                z = (n * 0.419) % 32;
            const [value, gx, gy, gz] = rockNoiseAt(x, y, z);
            low = Math.min(low, value);
            high = Math.max(high, value);
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(1);
            expect((rockNoiseAt(x + step, y, z)[0] - rockNoiseAt(x - step, y, z)[0]) / (2 * step)).toBeCloseTo(gx, 4);
            expect((rockNoiseAt(x, y + step, z)[0] - rockNoiseAt(x, y - step, z)[0]) / (2 * step)).toBeCloseTo(gy, 4);
            expect((rockNoiseAt(x, y, z + step)[0] - rockNoiseAt(x, y, z - step)[0]) / (2 * step)).toBeCloseTo(gz, 4);
        }
        // It uses its range: neither flat nor all on one side.
        expect(low).toBeLessThan(-0.5);
        expect(high).toBeGreaterThan(0.5);
    });

    it("bakes a texel for each sample, the noise at its lower corner", () => {
        const { data, size, cells, samples } = bakeRockNoise({ cells: 4, samples: 2 });
        expect([size, cells, samples]).toEqual([8, 4, 2]);
        expect(data.length).toBe(8 * 8 * 8 * 4);
        for (const [i, j, k] of [
            [0, 0, 0],
            [3, 5, 6],
            [7, 7, 7],
        ] as const) {
            const expected = rockNoiseAt(i / 2, j / 2, k / 2, 4);
            const at = ((k * 8 + j) * 8 + i) * 4;
            for (let part = 0; part < 4; part++) expect(data[at + part]).toBeCloseTo(expected[part]!, 6);
        }
    });

    it("read half way between two texels, is the noise within a few hundredths", () => {
        // What a line between two samples leaves out of the quintic, at the samples a cell the texture has by default.
        const samples = ROCK_NOISE_SAMPLES;
        let worst = 0;
        for (let n = 0; n < 300; n++) {
            const i = (n * 7) % (ROCK_NOISE_CELLS * samples),
                j = (n * 13) % (ROCK_NOISE_CELLS * samples),
                k = (n * 29) % (ROCK_NOISE_CELLS * samples);
            const a = rockNoiseAt(i / samples, j / samples, k / samples)[0];
            const b = rockNoiseAt((i + 1) / samples, j / samples, k / samples)[0];
            const middle = rockNoiseAt((i + 0.5) / samples, j / samples, k / samples)[0];
            worst = Math.max(worst, Math.abs((a + b) / 2 - middle));
        }
        expect(worst).toBeLessThan(0.06);
    });

    it("refuses a lattice it cannot repeat, and a texture too large", () => {
        expect(() => bakeRockNoise({ cells: 12 })).toThrow(RangeError);
        expect(() => bakeRockNoise({ cells: 1 })).toThrow(RangeError);
        expect(() => bakeRockNoise({ cells: 8, samples: 0 })).toThrow(RangeError);
        expect(() => bakeRockNoise({ cells: 128, samples: 4 })).toThrow(RangeError);
    });
});
