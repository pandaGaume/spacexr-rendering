/**
 * Builds the excavation of the example once, offline: chambers small and monumental joined by tunnels, grown as one
 * closed surface by `growChamber` and turned into rock by `buildRockFace` (both from `@spacexr/ceiling` of
 * terrain-core), then a walkway on its floor and lamps along it. Growing and dressing take tens of seconds, too long
 * for a page, and longer still in a headset.
 *
 * Writes `public/excavation/excavation.bin` and `excavation.json`, in the frame of Babylon.js (x east, y up, z north,
 * metres). The triangles are grouped by chamber, one group a chamber with the tunnels nearest to it: the groups are
 * the future tiles that a viewer loads as it needs them.
 *
 * Usage: tsx scripts/build-excavation.ts [--if-missing] [--edge 2] [--rock-edge 3.2] [--fuse texels|pairs|none]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The build of the sibling terrain-core checkout: `npm run build` in terrain-core/packages/ceiling first.
import {
    buildRockFace,
    fuseByTexels,
    growChamber,
    type IChamberObject,
} from "../../../../terrain-core/packages/ceiling/dist/index.js";

const OUT = fileURLToPath(new URL("../public/excavation/", import.meta.url));
const args = process.argv.slice(2);
const option = (name: string, fallback: number): number => {
    const at = args.indexOf(`--${name}`);
    const value = at >= 0 ? Number(args[at + 1]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : fallback;
};
if (args.includes("--if-missing") && existsSync(`${OUT}excavation.json`)) {
    console.log(
        "excavation: already built, kept. Run `npm run excavation` to build it again.",
    );
    process.exit(0);
}

/** Edge length of the grown surface, metres: a tunnel of 4 m radius gets about twelve sides. */
const EDGE = option("edge", 2);
/** Longest edge of the rock face: under it the relief is drawn per pixel. */
const ROCK_EDGE = option("rock-edge", 3.2);
/** Radius of the tunnels and margin of rock around each chamber, metres. */
const CLEARANCE = 4;

type Point3 = [number, number, number];

/** A chamber: an ellipsoid in east, north, up, metres. */
interface IChamber {
    name: string;
    centre: Point3;
    radii: Point3;
}

const CHAMBERS: IChamber[] = [
    { name: "hall", centre: [0, 0, -120], radii: [55, 35, 28] },
    { name: "dome", centre: [170, 70, -135], radii: [40, 40, 34] },
    { name: "west-cell", centre: [-160, 80, -125], radii: [8, 6, 4] },
    { name: "south-cell", centre: [85, -85, -126], radii: [10, 7, 5] },
    { name: "east-cell", centre: [260, -20, -150], radii: [7, 7, 5] },
];

/** Share of the radius of a chamber, from its centre, where a tunnel ends on its floor. */
const PORTAL = 0.7;

/**
 * Where a tunnel towards (east, north) ends in a chamber: on the ellipsoid of the chamber, under the centre, at
 * PORTAL of its radius in that direction. The axis of the tunnel stands on the ellipsoid there, so the floor of the
 * tunnel, a clearance under its axis, is the floor of the chamber, a clearance under the ellipsoid: the tunnel enters
 * the wall of the chamber at the level of its floor.
 *
 * A tunnel that started at the bottom of the chamber, under its centre, and ran out level, cut a trench under its
 * bowl-shaped floor up to the wall; the surface grew down the trench and over the floor, and where the two fronts
 * met they left thin sheets of rock across the mouth of the tunnel.
 */
const portal = (name: string, east: number, north: number): Point3 => {
    const {
        centre: [x, y, z],
        radii: [rx, ry, rz],
    } = CHAMBERS.find((chamber) => chamber.name === name)!;
    const length = Math.hypot(east - x, north - y) || 1;
    const [ux, uy] = [(east - x) / length, (north - y) / length];
    const reach = PORTAL / Math.hypot(ux / rx, uy / ry);
    return [
        x + ux * reach,
        y + uy * reach,
        z - rz * Math.sqrt(1 - PORTAL * PORTAL),
    ];
};
/** A tunnel from one chamber to another through a bend, whose height is halfway between its two ends. */
const tunnel = (
    from: string,
    [east, north]: [number, number],
    to: string,
): Point3[] => {
    const start = portal(from, east, north),
        end = portal(to, east, north);
    return [start, [east, north, (start[2] + end[2]) / 2], end];
};
/** Tunnels between chambers, by their axis: east, north, up. Ramps climb about one in five or less. */
const TUNNELS: Point3[][] = [
    tunnel("hall", [110, 45], "dome"),
    tunnel("hall", [-100, 45], "west-cell"),
    tunnel("hall", [60, -70], "south-cell"),
    tunnel("dome", [240, 0], "east-cell"),
    tunnel("south-cell", [180, -60], "east-cell"),
];

/** Walkways: through the chambers by their centre and along the tunnels. The heights only start the search of the floor. */
const centre = (name: string): Point3 =>
    CHAMBERS.find((chamber) => chamber.name === name)!.centre;
const ROUTES: Point3[][] = [
    [
        centre("west-cell"),
        ...[...TUNNELS[1]!].reverse(),
        centre("hall"),
        ...TUNNELS[0]!,
        centre("dome"),
        ...TUNNELS[3]!,
        centre("east-cell"),
    ],
    [
        centre("hall"),
        ...TUNNELS[2]!,
        centre("south-cell"),
        ...TUNNELS[4]!,
        centre("east-cell"),
    ],
];

/** Spacing of the floor lights along a walkway, metres. */
const LAMP_SPACING = 22;
const WALKWAY_WIDTH = 1.6;
/** Height over the floor of the point a floor light aims at on its wall, as a share of the distance to the wall. */
const AIM_RISE = 0.8;

function ellipsoid({
    centre: [cx, cy, cz],
    radii: [rx, ry, rz],
}: IChamber): IChamberObject {
    const points: { x: number; y: number; z: number }[] = [
        { x: cx, y: cy, z: cz + rz },
        { x: cx, y: cy, z: cz - rz },
    ];
    for (let i = 0; i < 16; i++)
        for (let j = 1; j < 8; j++) {
            const t = (i / 16) * 2 * Math.PI,
                p = (j / 8) * Math.PI;
            points.push({
                x: cx + rx * Math.sin(p) * Math.cos(t),
                y: cy + ry * Math.sin(p) * Math.sin(t),
                z: cz + rz * Math.cos(p),
            });
        }
    return { kind: "solid", points };
}

const objects: IChamberObject[] = [
    ...CHAMBERS.map(ellipsoid),
    ...TUNNELS.map((axis): IChamberObject => ({
        kind: "path",
        top: "content",
        points: axis.map(([x, y, z]) => ({ x, y, z })),
    })),
];

/**
 * How the fronts of the surface that met are fused: `texels` (the default) rebuilds the surface on a grid round the
 * places where they met, `pairs` sews the two sheets of each wall, `none` leaves the walls. `--fuse pairs|none`.
 */
const FUSE = ((): "texels" | "pairs" | "none" => {
    const asked = args[args.indexOf("--fuse") + 1];
    return args.includes("--fuse") && (asked === "pairs" || asked === "none")
        ? asked
        : "texels";
})();

let started = performance.now();
const grown = growChamber(
    {
        // The top of every chamber is its own: none opens up to the ground, 90 m over the shallowest of them.
        settings: {
            depth: 60,
            minDepth: 20,
            clearance: CLEARANCE,
            attraction: 1,
            top: "content",
            edgeLength: EDGE,
        },
        objects,
        reference: () => 0,
    },
    { fuse: FUSE === "pairs" },
);
const { report } = grown;
let mesh: { positions: Float64Array; indices: Uint32Array } = grown.mesh;
if (report.unreached.length > 0)
    throw new Error(
        `excavation: objects ${report.unreached.join(", ")} are not reached by the surface.`,
    );
console.log(
    `grown: ${mesh.indices.length / 3} triangles in ${Math.round(performance.now() - started)} ms`,
    JSON.stringify({
        steps: report.steps,
        complete: report.complete,
        contact: report.contact,
        squeezed: report.squeezed,
        settled: report.settled,
        unresolved: report.unresolved,
        free: report.free,
        fusion: report.fusion,
    }),
);

/**
 * Whether a point is inside a closed surface: the crossings of a ray going up from it, counted on the triangles over
 * it, found by a grid on the ground.
 */
function insideOf(surface: {
    positions: Float64Array;
    indices: Uint32Array;
}): (x: number, y: number, z: number) => boolean {
    const p = surface.positions;
    const cell = 4;
    const cells = new Map<string, number[]>();
    for (let f = 0; f < surface.indices.length; f += 3) {
        const xs = [0, 1, 2].map((k) => p[surface.indices[f + k]! * 3]!),
            ys = [0, 1, 2].map((k) => p[surface.indices[f + k]! * 3 + 1]!);
        for (
            let i = Math.floor(Math.min(...xs) / cell);
            i <= Math.floor(Math.max(...xs) / cell);
            i++
        )
            for (
                let j = Math.floor(Math.min(...ys) / cell);
                j <= Math.floor(Math.max(...ys) / cell);
                j++
            ) {
                const key = `${i},${j}`;
                const list = cells.get(key) ?? [];
                list.push(f);
                cells.set(key, list);
            }
    }
    return (x0, y0, z) => {
        // A little off, so that the ray does not graze a vertex or an edge.
        const x = x0 + 1.234567e-6,
            y = y0 + 2.345678e-6;
        let crossings = 0;
        for (const f of cells.get(
            `${Math.floor(x / cell)},${Math.floor(y / cell)}`,
        ) ?? []) {
            const [a, b, c] = [
                surface.indices[f]! * 3,
                surface.indices[f + 1]! * 3,
                surface.indices[f + 2]! * 3,
            ];
            const det =
                (p[b + 1]! - p[c + 1]!) * (p[a]! - p[c]!) +
                (p[c]! - p[b]!) * (p[a + 1]! - p[c + 1]!);
            if (det === 0) continue;
            const l1 =
                    ((p[b + 1]! - p[c + 1]!) * (x - p[c]!) +
                        (p[c]! - p[b]!) * (y - p[c + 1]!)) /
                    det,
                l2 =
                    ((p[c + 1]! - p[a + 1]!) * (x - p[c]!) +
                        (p[a]! - p[c]!) * (y - p[c + 1]!)) /
                    det,
                l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            if (l1 * p[a + 2]! + l2 * p[b + 2]! + l3 * p[c + 2]! > z)
                crossings++;
        }
        return crossings % 2 === 1;
    };
}

/**
 * The faces of a surface that are not on the wall of the volume: half a metre out of them, along their normal, the
 * volume goes on, and the surface has not filled it. They are the faces of the gaps the growth left where two of its
 * fronts met: thin sheets of rock across the void, to the eye. Their number and their area, in square metres.
 *
 * Without the second test, a face of a wedge of rock thinner than half a metre counts too: half a metre out of it is
 * the void on the other side of the wedge, which the surface has filled. Two such faces stand where the roofs of the
 * south and west tunnels meet the wall of the hall.
 *
 * One of them still counts, with the second test: where the wedge is 0.4 m thick, half a metre out falls between the
 * wall on the far side and the surface there, which stands a few centimetres short of the wall. It is a face of the
 * wall, all its vertices on it, 54 m from any place where fronts met: the count it leaves, one face of under a square
 * metre, is of the measure, not of the fusion.
 */
function gapFaces(surface: { positions: Float64Array; indices: Uint32Array }): {
    faces: number;
    area: number;
} {
    const p = surface.positions;
    const inside = insideOf(surface);
    let faces = 0,
        area = 0;
    for (let f = 0; f < surface.indices.length; f += 3) {
        const [a, b, c] = [
            surface.indices[f]! * 3,
            surface.indices[f + 1]! * 3,
            surface.indices[f + 2]! * 3,
        ];
        const u = [0, 1, 2].map((k) => p[b + k]! - p[a + k]!);
        const v = [0, 1, 2].map((k) => p[c + k]! - p[a + k]!);
        const n = [
            u[1]! * v[2]! - u[2]! * v[1]!,
            u[2]! * v[0]! - u[0]! * v[2]!,
            u[0]! * v[1]! - u[1]! * v[0]!,
        ];
        const length = Math.hypot(n[0]!, n[1]!, n[2]!);
        if (!(length > 0)) continue;
        const middle = [0, 1, 2].map(
            (k) => (p[a + k]! + p[b + k]! + p[c + k]!) / 3,
        );
        const out = middle.map((value, k) => value + (n[k]! / length) * 0.5);
        if (!grown.volume.contains(out[0]!, out[1]!, out[2]!)) continue;
        if (inside(out[0]!, out[1]!, out[2]!)) continue;
        faces++;
        area += length / 2;
    }
    return { faces, area: Math.round(area) };
}
/**
 * The faces of a surface that go through each other: the pairs of triangles without a vertex in common, an edge of
 * one going through the inside of the other, and the triangles in them. To the eye, a dark blade across the rock:
 * one sees the back of a face, or the void behind it. Round the mouths of the tunnels, where the rock between the
 * tunnel and the chamber thins to nothing, the two faces of that wedge passed each other this way before
 * `buildRockFace` limited each move by the room ahead of it.
 */
function crossingFaces(surface: {
    positions: ArrayLike<number>;
    indices: ArrayLike<number>;
}): { pairs: number; faces: number } {
    const p = surface.positions,
        index = surface.indices;
    const count = index.length / 3;
    const size = 3;
    const low = new Float64Array(count * 3),
        high = new Float64Array(count * 3);
    const grid = new Map<string, number[]>();
    for (let f = 0; f < count; f++) {
        for (let axis = 0; axis < 3; axis++) {
            const values = [0, 1, 2].map(
                (corner) => p[index[f * 3 + corner]! * 3 + axis]!,
            );
            low[f * 3 + axis] = Math.min(...values);
            high[f * 3 + axis] = Math.max(...values);
        }
        for (
            let i = Math.floor(low[f * 3]! / size);
            i <= Math.floor(high[f * 3]! / size);
            i++
        )
            for (
                let j = Math.floor(low[f * 3 + 1]! / size);
                j <= Math.floor(high[f * 3 + 1]! / size);
                j++
            )
                for (
                    let k = Math.floor(low[f * 3 + 2]! / size);
                    k <= Math.floor(high[f * 3 + 2]! / size);
                    k++
                ) {
                    const key = `${i},${j},${k}`;
                    const list = grid.get(key);
                    if (list) list.push(f);
                    else grid.set(key, [f]);
                }
    }
    // Whether the edge from one vertex to another goes through the inside of a face (Möller and Trumbore).
    const through = (from: number, to: number, f: number): boolean => {
        const [a, b, c] = [
            index[f * 3]! * 3,
            index[f * 3 + 1]! * 3,
            index[f * 3 + 2]! * 3,
        ];
        const o = [0, 1, 2].map((axis) => p[from * 3 + axis]!);
        const d = [0, 1, 2].map((axis) => p[to * 3 + axis]! - o[axis]!);
        const u = [0, 1, 2].map((axis) => p[b + axis]! - p[a + axis]!);
        const v = [0, 1, 2].map((axis) => p[c + axis]! - p[a + axis]!);
        const h = [
            d[1]! * v[2]! - d[2]! * v[1]!,
            d[2]! * v[0]! - d[0]! * v[2]!,
            d[0]! * v[1]! - d[1]! * v[0]!,
        ];
        const det = u[0]! * h[0]! + u[1]! * h[1]! + u[2]! * h[2]!;
        if (Math.abs(det) < 1e-14) return false;
        const s = [0, 1, 2].map((axis) => o[axis]! - p[a + axis]!);
        const first = (s[0]! * h[0]! + s[1]! * h[1]! + s[2]! * h[2]!) / det;
        if (first <= 1e-7 || first >= 1 - 1e-7) return false;
        const q = [
            s[1]! * u[2]! - s[2]! * u[1]!,
            s[2]! * u[0]! - s[0]! * u[2]!,
            s[0]! * u[1]! - s[1]! * u[0]!,
        ];
        const second = (d[0]! * q[0]! + d[1]! * q[1]! + d[2]! * q[2]!) / det;
        if (second <= 1e-7 || first + second >= 1 - 1e-7) return false;
        const along = (v[0]! * q[0]! + v[1]! * q[1]! + v[2]! * q[2]!) / det;
        return along > 1e-7 && along < 1 - 1e-7;
    };
    const tried = new Set<number>();
    const faces = new Set<number>();
    let pairs = 0;
    for (const list of grid.values())
        for (let x = 0; x < list.length; x++)
            for (let y = x + 1; y < list.length; y++) {
                const s = Math.min(list[x]!, list[y]!),
                    t = Math.max(list[x]!, list[y]!);
                let apart = false;
                for (let axis = 0; axis < 3; axis++)
                    if (
                        high[s * 3 + axis]! < low[t * 3 + axis]! ||
                        high[t * 3 + axis]! < low[s * 3 + axis]!
                    )
                        apart = true;
                if (apart) continue;
                const sv = [
                        index[s * 3]!,
                        index[s * 3 + 1]!,
                        index[s * 3 + 2]!,
                    ],
                    tv = [index[t * 3]!, index[t * 3 + 1]!, index[t * 3 + 2]!];
                if (sv.some((vertex) => tv.includes(vertex))) continue;
                if (tried.has(s * count + t)) continue;
                tried.add(s * count + t);
                let hit = false;
                for (let edge = 0; edge < 3 && !hit; edge++)
                    hit =
                        through(sv[edge]!, sv[(edge + 1) % 3]!, t) ||
                        through(tv[edge]!, tv[(edge + 1) % 3]!, s);
                if (!hit) continue;
                pairs++;
                faces.add(s).add(t);
            }
    return { pairs, faces: faces.size };
}
console.log("gaps left by the growth:", JSON.stringify(gapFaces(mesh)));

if (FUSE === "texels") {
    started = performance.now();
    const fused = fuseByTexels({
        positions: mesh.positions,
        indices: mesh.indices,
        meetings: grown.meetings,
        volume: grown.volume,
        edgeLength: EDGE,
    });
    mesh = fused;
    const { boxes, ...counts } = fused.report;
    console.log(
        `fused on texels: ${mesh.indices.length / 3} triangles in ${Math.round(performance.now() - started)} ms`,
        JSON.stringify(counts),
    );
    for (const box of boxes)
        console.log(
            `  box ${box.min.map((v) => v.toFixed(0)).join(",")} to ${box.max.map((v) => v.toFixed(0)).join(",")}: ${box.texels} texels, ${box.fused ? `${box.replaced} faces replaced by ${box.rebuilt}` : `kept: ${box.why}`}`,
        );
    console.log("gaps left after the fusion:", JSON.stringify(gapFaces(mesh)));
}

started = performance.now();
const face = buildRockFace(mesh, {
    edgeLength: ROCK_EDGE,
    maxDisplacement: 0.5 * CLEARANCE,
    scale: 0.1,
    up: "z",
});
const rockTime = Math.round(performance.now() - started);
const crossingBefore = crossingFaces(mesh);
const crossingAfter = crossingFaces(face);
console.log(
    `rock: ${face.report.triangles} triangles in ${rockTime} ms, moves ${face.report.displacement.min.toFixed(2)} to ${face.report.displacement.max.toFixed(2)} m, ${face.report.limited} of them cut short where the rock or the void is thin, ${face.report.unturned} more for a face turned over`,
);
console.log(
    `faces that go through each other: ${crossingBefore.pairs} pairs before the rock, ${crossingAfter.pairs} after (${crossingAfter.faces} faces)`,
);
if (crossingAfter.pairs > 0)
    console.warn(
        "excavation: the rock face crosses itself, dark blades will show.",
    );

// To Babylon.js: x east, y up, z north. Two corners of each triangle are swapped, so that its front face, as the
// default side orientation of Babylon.js 9 reads it, is the side towards the void (checked in a browser). The normals
// turn inwards too, towards the void, the side one sees.
const vertices = face.positions.length / 3;
const positions = new Float32Array(face.positions.length);
const normals = new Float32Array(face.positions.length);
for (let v = 0; v < vertices; v++) {
    positions.set(
        [
            face.positions[v * 3]!,
            face.positions[v * 3 + 2]!,
            face.positions[v * 3 + 1]!,
        ],
        v * 3,
    );
    normals.set(
        [
            -face.normals[v * 3]!,
            -face.normals[v * 3 + 2]!,
            -face.normals[v * 3 + 1]!,
        ],
        v * 3,
    );
}

// Each triangle goes to the chamber whose surface is nearest its middle: one group, one future tile, a chamber.
const triangles = face.indices.length / 3;
const groups: number[][] = CHAMBERS.map(() => []);
for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [
        face.indices[t * 3]!,
        face.indices[t * 3 + 1]!,
        face.indices[t * 3 + 2]!,
    ];
    const middle = [0, 1, 2].map(
        (axis) =>
            (face.positions[a * 3 + axis]! +
                face.positions[b * 3 + axis]! +
                face.positions[c * 3 + axis]!) /
            3,
    );
    let best = 0,
        nearest = Infinity;
    CHAMBERS.forEach((chamber, index) => {
        const reach = Math.hypot(
            ...middle.map(
                (value, axis) =>
                    (value - chamber.centre[axis]!) / chamber.radii[axis]!,
            ),
        );
        const distance = (reach - 1) * Math.min(...chamber.radii);
        if (distance < nearest) {
            nearest = distance;
            best = index;
        }
    });
    groups[best]!.push(a, c, b);
}
const indices = new Uint32Array(groups.flat());

// Floor under a point: the highest triangle under it, found among the triangles of its cell on the ground.
const CELL = 4;
const cells = new Map<string, number[]>();
for (let t = 0; t < triangles; t++) {
    const xs = [0, 1, 2].map((k) => positions[indices[t * 3 + k]! * 3]!),
        zs = [0, 1, 2].map((k) => positions[indices[t * 3 + k]! * 3 + 2]!);
    for (
        let i = Math.floor(Math.min(...xs) / CELL);
        i <= Math.floor(Math.max(...xs) / CELL);
        i++
    )
        for (
            let j = Math.floor(Math.min(...zs) / CELL);
            j <= Math.floor(Math.max(...zs) / CELL);
            j++
        ) {
            const key = `${i},${j}`;
            const list = cells.get(key) ?? [];
            list.push(t);
            cells.set(key, list);
        }
}
/** Height of the rock under (x, z), the first met going down from `top`, facing up; or null. */
function floorUnder(x: number, z: number, top: number): number | null {
    let found: number | null = null;
    for (const t of cells.get(
        `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`,
    ) ?? []) {
        const [a, b, c] = [0, 1, 2].map((k) => indices[t * 3 + k]! * 3) as [
            number,
            number,
            number,
        ];
        const ax = positions[a]!,
            az = positions[a + 2]!,
            bx = positions[b]!,
            bz = positions[b + 2]!,
            cx = positions[c]!,
            cz = positions[c + 2]!;
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det,
            l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det,
            l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const y =
            l1 * positions[a + 1]! +
            l2 * positions[b + 1]! +
            l3 * positions[c + 1]!;
        // A floor faces up, towards the void over it.
        const up =
            l1 * normals[a + 1]! + l2 * normals[b + 1]! + l3 * normals[c + 1]!;
        if (y <= top && up > 0 && (found === null || y > found)) found = y;
    }
    return found;
}

// Rays through the rock: the triangles in a 3D grid, walked cell by cell along the ray.
const CELL3 = 4;
const cells3 = new Map<string, number[]>();
for (let t = 0; t < triangles; t++) {
    const corner = (k: number, axis: number): number =>
        positions[indices[t * 3 + k]! * 3 + axis]!;
    const low = [0, 1, 2].map((axis) =>
        Math.floor(
            Math.min(corner(0, axis), corner(1, axis), corner(2, axis)) / CELL3,
        ),
    );
    const high = [0, 1, 2].map((axis) =>
        Math.floor(
            Math.max(corner(0, axis), corner(1, axis), corner(2, axis)) / CELL3,
        ),
    );
    for (let i = low[0]!; i <= high[0]!; i++)
        for (let j = low[1]!; j <= high[1]!; j++)
            for (let k = low[2]!; k <= high[2]!; k++) {
                const key = `${i},${j},${k}`;
                const list = cells3.get(key) ?? [];
                list.push(t);
                cells3.set(key, list);
            }
}
/**
 * The first wall a ray meets from inside the excavation: its distance, or null within `reach` metres. With
 * `steepOnly` false, the first rock of any kind, floor and roof too.
 */
function wallAlong(
    origin: Point3,
    direction: Point3,
    reach: number,
    steepOnly = true,
): number | null {
    const seen = new Set<string>();
    let nearest: number | null = null;
    for (let s = 0; s <= reach && nearest === null; s += CELL3 / 2) {
        // The cells around the point reached, so that no cell the ray crosses between two steps is missed.
        const base = [0, 1, 2].map((axis) =>
            Math.floor((origin[axis]! + direction[axis]! * s) / CELL3),
        );
        for (let di = -1; di <= 1; di++)
            for (let dj = -1; dj <= 1; dj++)
                for (let dk = -1; dk <= 1; dk++) {
                    const key = `${base[0]! + di},${base[1]! + dj},${base[2]! + dk}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    for (const t of cells3.get(key) ?? []) {
                        const [a, b, c] = [0, 1, 2].map(
                            (k) => indices[t * 3 + k]! * 3,
                        ) as [number, number, number];
                        const e1 = [0, 1, 2].map(
                            (axis) =>
                                positions[b + axis]! - positions[a + axis]!,
                        );
                        const e2 = [0, 1, 2].map(
                            (axis) =>
                                positions[c + axis]! - positions[a + axis]!,
                        );
                        const p = [
                            direction[1] * e2[2]! - direction[2] * e2[1]!,
                            direction[2] * e2[0]! - direction[0] * e2[2]!,
                            direction[0] * e2[1]! - direction[1] * e2[0]!,
                        ];
                        const det =
                            e1[0]! * p[0]! + e1[1]! * p[1]! + e1[2]! * p[2]!;
                        if (Math.abs(det) < 1e-12) continue;
                        const tv = [0, 1, 2].map(
                            (axis) => origin[axis]! - positions[a + axis]!,
                        );
                        const u =
                            (tv[0]! * p[0]! + tv[1]! * p[1]! + tv[2]! * p[2]!) /
                            det;
                        if (u < 0 || u > 1) continue;
                        const q = [
                            tv[1]! * e1[2]! - tv[2]! * e1[1]!,
                            tv[2]! * e1[0]! - tv[0]! * e1[2]!,
                            tv[0]! * e1[1]! - tv[1]! * e1[0]!,
                        ];
                        const v =
                            (direction[0] * q[0]! +
                                direction[1] * q[1]! +
                                direction[2] * q[2]!) /
                            det;
                        if (v < 0 || u + v > 1) continue;
                        const distance =
                            (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) /
                            det;
                        if (distance <= 0.05 || distance > reach) continue;
                        // A wall seen from inside faces back along the ray, and stands steep: the bumps of a
                        // floor, which face up, are not walls.
                        const normal = [0, 1, 2].map(
                            (axis) =>
                                (1 - u - v) * normals[a + axis]! +
                                u * normals[b + axis]! +
                                v * normals[c + axis]!,
                        );
                        const facing =
                            normal[0]! * direction[0] +
                            normal[1]! * direction[1] +
                            normal[2]! * direction[2];
                        // Steep: within about 55 degrees of upright, which the round wall of a tunnel is at the
                        // height the walls are looked for.
                        const steep =
                            Math.abs(normal[1]!) <
                            0.8 *
                                Math.hypot(normal[0]!, normal[1]!, normal[2]!);
                        if (
                            (!steepOnly || (facing < 0 && steep)) &&
                            (nearest === null || distance < nearest)
                        )
                            nearest = distance;
                    }
                }
    }
    return nearest;
}

interface IWalkway {
    /** Points of the middle line every metre: x, y (top of the walkway), z. */
    points: number[];
}
/** A light set in the floor beside a walkway, aimed up at the wall on its side. */
interface IFloorLight {
    position: Point3;
    /** Unit direction it aims along. */
    direction: Point3;
    /** Distance to the point it aims at, metres: its power follows it. */
    throw: number;
    /** Angle of its cone, radians. */
    angle: number;
    /** Where its light ends, metres. */
    range: number;
}

/**
 * The beam of a floor light. Its cone covers some sixteen metres of wall at the point it aims at, between the
 * narrowest and the widest. Its range, where its light ends, is the farthest rock it sees in its cone and three
 * tenths more: the light fades to nothing at its range, and still gives two fifths of itself at that rock. Without
 * shadows, a light that went on after it would light, through the rock, chambers it does not see; one that stopped
 * short would leave dark the roof of a monumental chamber, which it does see.
 */
const BEAM = {
    longestThrow: 60,
    narrowest: (35 * Math.PI) / 180,
    widest: (110 * Math.PI) / 180,
    across: 16,
    beyond: 1.3,
    /** Height of the lens over the floor, where the page sets the light. */
    lens: 0.15,
    /** How far the rock is looked for. */
    sight: 220,
};
function beam(
    position: Point3,
    direction: Point3,
    distance: number,
): { throw: number; angle: number; range: number } {
    const reach = Math.min(distance, BEAM.longestThrow);
    const angle = Math.max(
        BEAM.narrowest,
        Math.min(BEAM.widest, 2 * Math.atan(BEAM.across / 2 / reach)),
    );
    const cross = (a: Point3, b: Point3): Point3 => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    // Two directions across the beam.
    const raw = cross(
        direction,
        Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
    );
    const length = Math.hypot(...raw);
    const side = raw.map((value) => value / length) as Point3;
    const over = cross(direction, side);
    const origin: Point3 = [position[0], position[1] + BEAM.lens, position[2]];
    // Rays on the axis and on three rings of the cone: the farthest rock one of them meets first.
    let farthest = 0;
    for (const share of [0, 0.35, 0.7, 0.95])
        for (let step = 0; step < (share === 0 ? 1 : 8); step++) {
            const off = (share * angle) / 2,
                turn = (step * Math.PI) / 4;
            const ray = [0, 1, 2].map(
                (axis) =>
                    direction[axis]! * Math.cos(off) +
                    (side[axis]! * Math.cos(turn) +
                        over[axis]! * Math.sin(turn)) *
                        Math.sin(off),
            ) as Point3;
            const met = wallAlong(origin, ray, BEAM.sight, false);
            if (met !== null) farthest = Math.max(farthest, met);
        }
    return {
        throw: reach,
        angle,
        range: farthest > 0 ? farthest * BEAM.beyond + 4 : reach * 1.6 + 8,
    };
}
const walkways: IWalkway[] = [];
const lamps: IFloorLight[] = [];
for (const route of ROUTES) {
    // Resampled every metre on the ground, in Babylon.js axes; the height is where the search of the floor starts. A
    // leg that only goes down, from the centre of a chamber to its bottom, adds no point: a walkway runs on a floor.
    const samples: Point3[] = [];
    for (let k = 0; k + 1 < route.length; k++) {
        const [a, b] = [route[k]!, route[k + 1]!];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0; s < length; s += 1) {
            const f = s / length;
            samples.push([
                a[0] + (b[0] - a[0]) * f,
                a[2] + (b[2] - a[2]) * f,
                a[1] + (b[1] - a[1]) * f,
            ]);
        }
    }
    const last = route[route.length - 1]!;
    samples.push([last[0], last[2], last[1]]);
    // The walkway is laid on the highest rock across its width, then smoothed over 7 m: it bridges the hollows. Each
    // point looks for the floor just over the one before, not over the axis of the route: from the axis, the search
    // caught ledges of rock several metres over the floor where a tunnel opens into a chamber.
    let previousFloor: number | null = null;
    const raw = samples.map(([x, y, z], index) => {
        const next = samples[Math.min(samples.length - 1, index + 1)]!,
            previous = samples[Math.max(0, index - 1)]!;
        const dx = next[0] - previous[0],
            dz = next[2] - previous[2],
            length = Math.hypot(dx, dz) || 1;
        const side = [-dz / length, dx / length];
        let best: number | null = null;
        for (const s of [-0.5, 0, 0.5]) {
            const h = floorUnder(
                x + side[0]! * s * WALKWAY_WIDTH,
                z + side[1]! * s * WALKWAY_WIDTH,
                // A metre between two points: the walkway climbs at most 1.2 m from one to the next.
                previousFloor === null ? y + CLEARANCE : previousFloor + 1.2,
            );
            if (h !== null && (best === null || h > best)) best = h;
        }
        if (best !== null) previousFloor = best;
        return best;
    });
    const known = raw.filter((h): h is number => h !== null);
    if (known.length < raw.length * 0.9)
        throw new Error(
            "excavation: a walkway finds no floor under most of its length.",
        );
    const heights = raw.map(
        (h, index) =>
            h ??
            raw
                .slice(0, index)
                .reverse()
                .find((x) => x !== null) ??
            known[0]!,
    );
    const smooth = heights.map((_, index) => {
        let sum = 0,
            count = 0;
        for (let k = index - 3; k <= index + 3; k++) {
            const h = heights[Math.max(0, Math.min(heights.length - 1, k))]!;
            sum += h;
            count++;
        }
        return Math.max(heights[index]!, sum / count) + 0.06;
    });
    const points: number[] = [];
    samples.forEach(([x, , z], index) => points.push(x, smooth[index]!, z));
    walkways.push({ points });
    // A floor light every LAMP_SPACING metres, on one side then the other, aimed at the nearest wall on its side
    // and up it: the light washes the rock from below, the walkway takes what the wall sends back.
    for (
        let index = LAMP_SPACING / 2, side = 1;
        index < samples.length;
        index += LAMP_SPACING, side = -side
    ) {
        const at = Math.round(index);
        const next = samples[Math.min(samples.length - 1, at + 1)]!,
            previous = samples[Math.max(0, at - 1)]!;
        const dx = next[0] - previous[0],
            dz = next[2] - previous[2],
            length = Math.hypot(dx, dz) || 1;
        const along: Point3 = [dx / length, 0, dz / length];
        const across: Point3 = [(-dz / length) * side, 0, (dx / length) * side];
        const position: Point3 = [
            samples[at]![0] + across[0] * (WALKWAY_WIDTH / 2 + 0.35),
            smooth[at]!,
            samples[at]![2] + across[2] * (WALKWAY_WIDTH / 2 + 0.35),
        ];
        // The nearest wall on its side, among directions within 60 degrees of straight across. Looked for from 2.5 m,
        // over the bumps of the floor and where the wall of a tunnel stands steep; in a monumental chamber, whose
        // bowl-shaped floor rises gently for tens of metres, higher up, where its wall stands.
        let best: { direction: Point3; distance: number; eye: Point3 } | null =
            null;
        for (const height of [2.5, 6, 12, 20]) {
            const eye: Point3 = [
                position[0],
                position[1] + height,
                position[2],
            ];
            for (const turn of [-60, -40, -20, 0, 20, 40, 60]) {
                const r = (turn * Math.PI) / 180;
                const direction: Point3 = [
                    across[0] * Math.cos(r) + along[0] * Math.sin(r),
                    0,
                    across[2] * Math.cos(r) + along[2] * Math.sin(r),
                ];
                const distance = wallAlong(eye, direction, 150);
                if (
                    distance !== null &&
                    (best === null || distance < best.distance)
                )
                    best = { direction, distance, eye };
            }
            if (best) break;
        }
        if (!best) {
            console.log(
                `no wall for a floor light at ${position.map((value) => value.toFixed(1)).join(", ")}`,
            );
            continue;
        }
        const eye = best.eye;
        const rise = Math.min(30, Math.max(2, AIM_RISE * best.distance));
        const aim: Point3 = [
            eye[0] + best.direction[0] * best.distance,
            eye[1] + rise,
            eye[2] + best.direction[2] * best.distance,
        ];
        const toward: Point3 = [
            aim[0] - position[0],
            aim[1] - position[1],
            aim[2] - position[2],
        ];
        const reach = Math.hypot(...toward);
        lamps.push({
            position,
            direction: toward.map((value) => value / reach) as Point3,
            ...beam(
                position,
                toward.map((value) => value / reach) as Point3,
                reach,
            ),
        });
    }
}

// The monumental chambers: their walkway crosses them far from the walls. A ring of floor lights at the foot of
// their walls washes them upwards, one every RING_SPACING metres around.
const RING_SPACING = 35;
for (const chamber of CHAMBERS) {
    const [cx, cy, cz] = chamber.centre;
    const [rx, ry] = chamber.radii;
    if (Math.min(rx, ry) < 20) continue;
    const perimeter = Math.PI * (rx + ry);
    const count = Math.max(4, Math.round(perimeter / RING_SPACING));
    const centreFloor = floorUnder(cx, cy, cz);
    if (centreFloor === null) continue;
    for (let k = 0; k < count; k++) {
        const angle = ((k + 0.5) / count) * 2 * Math.PI;
        const direction: Point3 = [Math.cos(angle), 0, Math.sin(angle)];
        // The wall in that direction, seen from over the floor at the centre.
        let distance: number | null = null;
        for (const height of [6, 12, 20]) {
            distance = wallAlong(
                [cx, centreFloor + height, cy],
                direction,
                200,
            );
            if (distance !== null) break;
        }
        if (distance === null) continue;
        // On the floor, some metres short of the wall, aimed up it.
        const stand = Math.max(distance * 0.75, distance - 8);
        const x = cx + direction[0] * stand,
            z = cy + direction[2] * stand;
        const floor = floorUnder(x, z, centreFloor + 20);
        if (floor === null) continue;
        const position: Point3 = [x, floor, z];
        const toWall = distance - stand;
        const aim: Point3 = [
            cx + direction[0] * distance,
            floor + Math.min(30, Math.max(6, 2.5 * toWall)),
            cy + direction[2] * distance,
        ];
        const toward: Point3 = [
            aim[0] - position[0],
            aim[1] - position[1],
            aim[2] - position[2],
        ];
        const reach = Math.hypot(...toward);
        lamps.push({
            position,
            direction: toward.map((value) => value / reach) as Point3,
            ...beam(
                position,
                toward.map((value) => value / reach) as Point3,
                reach,
            ),
        });
    }
}

mkdirSync(OUT, { recursive: true });
const binary = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(indices.buffer),
]);
writeFileSync(`${OUT}excavation.bin`, binary);
let offset = 0;
writeFileSync(
    `${OUT}excavation.json`,
    JSON.stringify(
        {
            frame: "Babylon.js: x east, y up, z north, metres",
            detailWavelength: face.detailWavelength,
            vertices,
            triangles,
            buffers: {
                positions: [0, positions.byteLength],
                normals: [positions.byteLength, normals.byteLength],
                indices: [2 * positions.byteLength, indices.byteLength],
            },
            chambers: CHAMBERS.map((chamber, index) => {
                const start = offset;
                offset += groups[index]!.length;
                return {
                    name: chamber.name,
                    centre: [
                        chamber.centre[0],
                        chamber.centre[2],
                        chamber.centre[1],
                    ],
                    indices: [start, groups[index]!.length],
                };
            }),
            walkways,
            lamps,
            settings: {
                edge: EDGE,
                rockEdge: ROCK_EDGE,
                clearance: CLEARANCE,
                lampSpacing: LAMP_SPACING,
                aimRise: AIM_RISE,
                walkwayWidth: WALKWAY_WIDTH,
            },
        },
        (_key, value: unknown) =>
            typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
    ),
);
console.log(
    `written: ${OUT} (${(binary.byteLength / 1e6).toFixed(1)} MB, ${walkways.length} walkways, ${lamps.length} floor lights)`,
);
