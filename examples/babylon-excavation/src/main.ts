/**
 * An excavation to walk in: chambers small and monumental joined by tunnels, a walkway on the floor, and lights set
 * in the floor beside it, every twenty metres or so, each aimed up the wall on its side.
 *
 * The rock is built offline by `scripts/build-excavation.ts` (`growChamber` and `buildRockFace` of `@spacexr/ceiling`),
 * which also aims the lights, and drawn here with the rock face of `@spacexr/babylon-underground`, which adds per
 * pixel the relief under the wavelength the mesh carries.
 *
 * A material takes a few lights at once. The rock and the walkway are cut into blocks, each lit by the floor lights
 * whose beam passes nearest to it.
 *
 * Walking follows the ground: the eyes stay at a person's height over whatever is under them, walkway or rock, so
 * one steps off the walkway and back on it. Only the upper body meets the walls.
 *
 * Keys: W, A, S, D or the arrows walk, drag looks around, Shift runs, + and - set the speed, F flies (through the
 * rock), M turns the relief per pixel off and on, L lights the whole excavation, then leaves the floor lights alone,
 * then comes back to the faint fill. Address: `?octaves=7`, `?speed=12` in metres a second.
 */
import "@babylonjs/core/Collisions/collisionCoordinator.js";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Meshes/instancedMesh.js";

import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.core.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup.js";
import { Scene } from "@babylonjs/core/scene.js";
import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import { offerHeadset } from "../../../../spatial-display/examples/xr.js";
import {
    createRockFaceMaterial,
    createRockNoiseTexture,
    kelvinToLinearRgb,
    ROCK_FACE_DETAIL,
    ROCK_FACE_OCTAVES,
} from "@spacexr/babylon-underground";

type Point3 = [number, number, number];

/** What `scripts/build-excavation.ts` writes beside the binary. */
interface IExcavation {
    detailWavelength: number;
    vertices: number;
    triangles: number;
    buffers: {
        positions: [number, number];
        normals: [number, number];
        indices: [number, number];
    };
    chambers: { name: string; centre: Point3; indices: [number, number] }[];
    walkways: { points: number[] }[];
    lamps: {
        position: Point3;
        direction: Point3;
        throw: number;
        angle: number;
        range: number;
    }[];
    settings: { walkwayWidth: number };
}

const params = new URLSearchParams(location.search);
/**
 * The relief per pixel is nearly all of what an image costs: a noise for each octave, and two more for the grain.
 * The noise is read from a 3D texture it was baked into, one read a noise: the same rock on a screen and in a
 * headset. `?noise=computed` computes it in the shader instead, eight hashes a noise: a headset then gets two octaves
 * and no grain, where a screen has seven and the grain. `?octaves=` sets the octaves in both cases.
 */
const BAKED = params.get("noise") !== "computed";
/** Side of the blocks the rock and the walkway are cut into for their lights, metres. */
const BLOCK = 24;
/**
 * The most floor lights one block takes: the material takes these and the fill. Each block takes every light that
 * reaches it, seven at most in this excavation.
 */
const LIGHTS_PER_BLOCK = 8;
/**
 * A floor light: its colour temperature and the illuminance it gives the point it aims at (its intensity in candela
 * grows with the square of the distance). Its cone and its range come with the excavation, which knows the rock it
 * sees.
 */
const FLOOR_LIGHT = {
    kelvin: 3400,
    atTarget: 14,
};
/**
 * The light on everything, which L takes from one level to the next: faint, enough to see where one walks between
 * two floor lights; bright, to see the rock of the whole excavation, grey under it; none, the floor lights alone.
 */
const FILLS = [
    { intensity: 0.08, name: "pénombre" },
    { intensity: 0.9, name: "roche éclairée" },
    { intensity: 0, name: "projecteurs seuls" },
] as const;
const EYES = 1.7;
/** Images a second asked of a headset, where it offers them. */
const HEADSET_RATE = 72;
/**
 * Speed on foot, in metres a second, and the factors of running and of flying. Twelve metres a second is no walk: the
 * excavation is 450 m across with 900 m of walkways, and at the 3 m/s of a brisk walk crossing it took minutes. The
 * keys + and - change it, and `?speed=` sets it.
 */
const WALK = 12;
const RUN = 3;
const FLY = 3;
const SLOWEST = 1;
const FASTEST = 120;
/** What is left of the move of an image in the next one. */
const INERTIA = 0.7;
/**
 * The `speed` of a camera of Babylon.js for a speed in metres a second. Each image it moves by
 * `speed * sqrt(milliseconds / (images a second * 100))`, plus what its inertia keeps of the images before: that is
 * `speed * sqrt(10) / (1 - inertia)` metres a second, whatever the cadence.
 */
const cameraSpeed = (metresASecond: number): number =>
    (metresASecond * (1 - INERTIA)) / Math.sqrt(10);

const status = document.getElementById("status")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { xrCompatible: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.01, 0.01, 0.012, 1);
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure = 1;
scene.collisionsEnabled = true;
// The near blocks are drawn first: the far ones behind them are then not shaded for nothing, and the rock costs a lot
// for each pixel. Babylon.js draws what is opaque in the order it was made otherwise.
scene.setRenderingOrder(0, RenderingGroup.frontToBackSortCompare);

const camera = new UniversalCamera("walker", new Vector3(0, 0, 0), scene);
camera.minZ = 0.05;
camera.maxZ = 1500;
camera.speed = cameraSpeed(WALK);
camera.angularSensibility = 2500;
camera.inertia = INERTIA;
camera.keysUp.push(87);
camera.keysDown.push(83);
camera.keysLeft.push(65);
camera.keysRight.push(68);
// The upper body only, from 0.9 m to 1.7 m over the ground (Babylon centres the ellipsoid its height under the eyes):
// the walls stop it, steps and the edges of the walkway do not.
camera.ellipsoid = new Vector3(0.3, 0.4, 0.3);
camera.checkCollisions = true;
camera.applyGravity = false;
camera.attachControl(canvas, true);

// A faint fill, so that the rock between two lights is not pitch black. First of the lights: every block takes it.
const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
fill.intensity = FILLS[0].intensity;
fill.diffuse = new Color3(0.75, 0.8, 0.9);
fill.groundColor = new Color3(0.25, 0.22, 0.2);
fill.specular = Color3.Black();

/** Cuts triangles into blocks of BLOCK metres by their middle: a mesh for each block. */
function blocks(
    name: string,
    positions: Float32Array,
    normals: Float32Array,
    indices: Uint32Array,
    from: number,
    count: number,
): Mesh[] {
    const byBlock = new Map<string, number[]>();
    for (let at = from; at < from + count; at += 3) {
        const middle = [0, 1, 2].map(
            (axis) =>
                (positions[indices[at]! * 3 + axis]! +
                    positions[indices[at + 1]! * 3 + axis]! +
                    positions[indices[at + 2]! * 3 + axis]!) /
                3,
        );
        const key = middle.map((value) => Math.floor(value / BLOCK)).join(",");
        const list = byBlock.get(key) ?? [];
        list.push(indices[at]!, indices[at + 1]!, indices[at + 2]!);
        byBlock.set(key, list);
    }
    const meshes: Mesh[] = [];
    for (const [key, list] of byBlock) {
        // Each block keeps only its own vertices.
        const remap = new Map<number, number>();
        const p: number[] = [],
            n: number[] = [],
            i: number[] = [];
        for (const index of list) {
            let local = remap.get(index);
            if (local === undefined) {
                local = remap.size;
                remap.set(index, local);
                p.push(
                    positions[index * 3]!,
                    positions[index * 3 + 1]!,
                    positions[index * 3 + 2]!,
                );
                n.push(
                    normals[index * 3]!,
                    normals[index * 3 + 1]!,
                    normals[index * 3 + 2]!,
                );
            }
            i.push(local);
        }
        const mesh = new Mesh(`${name} ${key}`, scene);
        const data = new VertexData();
        data.positions = p;
        data.normals = n;
        data.indices = i;
        data.applyToMesh(mesh);
        mesh.checkCollisions = true;
        meshes.push(mesh);
    }
    return meshes;
}

/**
 * The walkways as one mesh, not drawn: the ground of a headset, which its viewer stands on and points at to go
 * there. Its origin is under its lowest point: Babylon.js lets one point straight at a floor only when the origin of
 * the floor is under the eyes, and under the ground the heights are negative.
 */
function walkwayGround(
    scene: Scene,
    ribbons: { positions: Float32Array; indices: Uint32Array }[],
): Mesh {
    let lowest = Infinity;
    for (const { positions } of ribbons)
        for (let at = 1; at < positions.length; at += 3)
            lowest = Math.min(lowest, positions[at]!);
    const origin = lowest - 1;
    const positions: number[] = [],
        indices: number[] = [];
    for (const ribbon of ribbons) {
        const first = positions.length / 3;
        for (let at = 0; at < ribbon.positions.length; at += 3)
            positions.push(
                ribbon.positions[at]!,
                ribbon.positions[at + 1]! - origin,
                ribbon.positions[at + 2]!,
            );
        for (const index of ribbon.indices) indices.push(first + index);
    }
    const ground = new Mesh("walkway ground", scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.applyToMesh(ground);
    ground.position.y = origin;
    ground.isVisible = false;
    // A mesh that is not drawn is never placed: its place is worked out now, for those who ask where it is.
    ground.computeWorldMatrix(true);
    ground.freezeWorldMatrix();
    return ground;
}

/** Width of the sloping edge of the walkway on each side, and how far it goes down: it meets the rock. */
const EDGE = { out: 0.45, down: 0.5 };

/** A walkway: a flat top and a sloping edge on each side, four vertices across, a row every metre. */
function walkwayRibbon(
    points: number[],
    width: number,
): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
    const rows = points.length / 3,
        across = 4;
    const positions = new Float32Array(rows * across * 3),
        normals = new Float32Array(rows * across * 3),
        indices: number[] = [];
    for (let k = 0; k < rows; k++) {
        const next = Math.min(rows - 1, k + 1),
            previous = Math.max(0, k - 1);
        const dx = points[next * 3]! - points[previous * 3]!,
            dz = points[next * 3 + 2]! - points[previous * 3 + 2]!,
            length = Math.hypot(dx, dz) || 1;
        const sx = -dz / length,
            sz = dx / length;
        const [x, y, z] = [
            points[k * 3]!,
            points[k * 3 + 1]!,
            points[k * 3 + 2]!,
        ];
        // From one side to the other: the outer foot of the edge, the top on that side, the top on the other side, the
        // other foot.
        const offsets: [number, number][] = [
            [width / 2 + EDGE.out, -EDGE.down],
            [width / 2, 0],
            [-width / 2, 0],
            [-(width / 2 + EDGE.out), -EDGE.down],
        ];
        offsets.forEach(([offset, drop], column) => {
            positions.set(
                [x + sx * offset, y + drop, z + sz * offset],
                (k * across + column) * 3,
            );
            const tilt = column === 0 ? 1 : column === 3 ? -1 : 0;
            const up = Math.hypot(tilt, 1);
            normals.set(
                [(sx * tilt) / up, 1 / up, (sz * tilt) / up],
                (k * across + column) * 3,
            );
        });
        if (k + 1 < rows)
            for (let column = 0; column + 1 < across; column++) {
                const a = k * across + column,
                    b = a + 1,
                    c = a + across,
                    d = c + 1;
                // Wound to face up in the left-handed frame of Babylon.js.
                indices.push(a, b, c, b, d, c);
            }
    }
    return { positions, normals, indices: Uint32Array.from(indices) };
}

/**
 * What a floor light gives a point, in lux before the angle of the surface, by the falloff the rock and the walkway
 * are drawn with (that of glTF): it ends, softly both times, at the edge of the cone and at the range of the light.
 */
function illuminance(
    light: SpotLight,
    x: number,
    y: number,
    z: number,
): number {
    const dx = x - light.position.x,
        dy = y - light.position.y,
        dz = z - light.position.z;
    const square = dx * dx + dy * dy + dz * dz;
    const farthest = light.range * light.range;
    if (square >= farthest) return 0;
    const aim = light.direction;
    const cos =
        (dx * aim.x + dy * aim.y + dz * aim.z) /
        ((Math.sqrt(square) || 1e-6) * aim.length());
    const edge = Math.cos(light.angle / 2);
    if (cos <= edge) return 0;
    const cone = ((cos - edge) / (1 - edge)) ** 2;
    const fade = (1 - (square / farthest) ** 2) ** 2;
    return (light.intensity * cone * fade) / Math.max(square, 1e-4);
}

/**
 * Gives each mesh the floor lights that reach it: every light that gives something to one of its vertices or to the
 * middle of one of its triangles. A material takes LIGHTS_PER_BLOCK of them: a mesh that more lights reach keeps the
 * strongest. Returns the number of lights left out that way: each would show as an edge between two blocks.
 */
function lightBlocks(meshes: Mesh[], lights: SpotLight[]): number {
    for (const light of lights) light.includedOnlyMeshes = [];
    let leftOut = 0;
    for (const mesh of meshes) {
        const positions = mesh.getVerticesData("position");
        const indices = mesh.getIndices();
        if (!positions || !indices) continue;
        const sphere = mesh.getBoundingInfo().boundingSphere;
        const reaching: { light: SpotLight; most: number }[] = [];
        for (const light of lights) {
            if (
                Vector3.Distance(sphere.centerWorld, light.position) >
                light.range + sphere.radiusWorld
            )
                continue;
            let most = 0;
            for (let at = 0; at < positions.length; at += 3)
                most = Math.max(
                    most,
                    illuminance(
                        light,
                        positions[at]!,
                        positions[at + 1]!,
                        positions[at + 2]!,
                    ),
                );
            for (let at = 0; at < indices.length; at += 3) {
                const a = indices[at]! * 3,
                    b = indices[at + 1]! * 3,
                    c = indices[at + 2]! * 3;
                most = Math.max(
                    most,
                    illuminance(
                        light,
                        (positions[a]! + positions[b]! + positions[c]!) / 3,
                        (positions[a + 1]! +
                            positions[b + 1]! +
                            positions[c + 1]!) /
                            3,
                        (positions[a + 2]! +
                            positions[b + 2]! +
                            positions[c + 2]!) /
                            3,
                    ),
                );
            }
            if (most > 0) reaching.push({ light, most });
        }
        reaching.sort((first, second) => second.most - first.most);
        leftOut += Math.max(0, reaching.length - LIGHTS_PER_BLOCK);
        for (const { light } of reaching.slice(0, LIGHTS_PER_BLOCK))
            light.includedOnlyMeshes.push(mesh);
    }
    return leftOut;
}

async function main(): Promise<void> {
    const started = performance.now();
    // The page is for a headset where the browser has an immersive session to give: nothing to add to the address.
    // ?xr asks for it all the same, as the examples of spatial-display do.
    const forHeadset =
        params.has("xr") ||
        (await WebXRSessionManager.IsSessionSupportedAsync(
            "immersive-vr",
        ).catch(() => false));
    // A headset has far less to draw with than a computer: where the noise is computed, it gets less of it.
    const lighter = forHeadset && !BAKED;
    const octaves =
        Number(params.get("octaves")) || (lighter ? 2 : ROCK_FACE_OCTAVES);
    const detail = lighter
        ? { ...ROCK_FACE_DETAIL, grain: 0 }
        : ROCK_FACE_DETAIL;
    const [layout, binary] = await Promise.all([
        fetch("/excavation/excavation.json").then(
            (response) => response.json() as Promise<IExcavation>,
        ),
        fetch("/excavation/excavation.bin").then((response) =>
            response.arrayBuffer(),
        ),
    ]);
    const view = <T>(
        Kind: new (buffer: ArrayBuffer, offset: number, length: number) => T,
        [offset, bytes]: [number, number],
    ): T => new Kind(binary, offset, bytes / 4);
    const positions = view(Float32Array, layout.buffers.positions);
    const normals = view(Float32Array, layout.buffers.normals);
    const indices = view(Uint32Array, layout.buffers.indices);

    // The rock: one material, the blocks of every chamber.
    const rock = createRockFaceMaterial("rock", scene, {
        detailWavelength: layout.detailWavelength,
        octaves,
        detail,
        ...(BAKED ? { noise: createRockNoiseTexture(scene) } : {}),
    });
    rock.material.maxSimultaneousLights = LIGHTS_PER_BLOCK + 1;
    // A light ends at the edge of its cone and at its range, softly (the falloff of glTF). By the default of the PBR
    // material it goes on for ever, as the inverse of the square of the distance, in a cone without an edge: lit by
    // the lights nearest to it alone, a block then showed an edge against its neighbour, lit by others.
    rock.material.useGLTFLightFalloff = true;
    const rockBlocks = layout.chambers.flatMap((chamber) =>
        blocks(
            chamber.name,
            positions,
            normals,
            indices,
            chamber.indices[0],
            chamber.indices[1],
        ),
    );
    for (const mesh of rockBlocks) mesh.material = rock.material;

    // The walkway: dark gravel, cut into blocks as the rock.
    const gravel = new PBRMaterial("walkway", scene);
    gravel.albedoColor = new Color3(0.3, 0.27, 0.23);
    gravel.metallic = 0;
    gravel.roughness = 0.95;
    gravel.maxSimultaneousLights = LIGHTS_PER_BLOCK + 1;
    gravel.useGLTFLightFalloff = true;
    const ribbons = layout.walkways.map((walkway) =>
        walkwayRibbon(walkway.points, layout.settings.walkwayWidth),
    );
    const walkwayBlocks = ribbons.flatMap((ribbon, index) =>
        blocks(
            `walkway ${index}`,
            ribbon.positions,
            ribbon.normals,
            ribbon.indices,
            0,
            ribbon.indices.length,
        ),
    );
    for (const mesh of walkwayBlocks) mesh.material = gravel;

    // The floor lights: a dark housing in the floor, a glowing lens, a spot aimed up the wall.
    const colour = new Color3(...kelvinToLinearRgb(FLOOR_LIGHT.kelvin));
    const housing = new StandardMaterial("housing", scene);
    housing.diffuseColor = new Color3(0.06, 0.06, 0.06);
    housing.specularColor = Color3.Black();
    const lens = new StandardMaterial("lens", scene);
    lens.disableLighting = true;
    lens.emissiveColor = colour.scale(1.6);
    const housingTemplate = CreateCylinder(
        "housing",
        { height: 0.12, diameter: 0.34, tessellation: 12 },
        scene,
    );
    housingTemplate.material = housing;
    const lensTemplate = CreateCylinder(
        "lens",
        { height: 0.02, diameter: 0.22, tessellation: 12 },
        scene,
    );
    lensTemplate.material = lens;
    const lights: SpotLight[] = layout.lamps.map(
        ({ position, direction, throw: reach, angle, range }, index) => {
            const from = new Vector3(...position);
            const aim = new Vector3(...direction);
            housingTemplate
                .createInstance(`housing ${index}`)
                .position.set(from.x, from.y + 0.06, from.z);
            lensTemplate
                .createInstance(`lens ${index}`)
                .position.set(from.x, from.y + 0.13, from.z);
            const light = new SpotLight(
                `floor light ${index}`,
                from.add(new Vector3(0, 0.15, 0)),
                aim,
                angle,
                2,
                scene,
            );
            light.diffuse = colour;
            light.specular = colour.scale(0.2);
            light.range = range;
            // The light fades to nothing at its range: what that takes from the point it aims at is given back.
            light.intensity =
                (FLOOR_LIGHT.atTarget * reach * reach) /
                (1 - (reach / light.range) ** 4) ** 2;
            return light;
        },
    );
    housingTemplate.isVisible = lensTemplate.isVisible = false;
    const leftOut = lightBlocks([...rockBlocks, ...walkwayBlocks], lights);
    if (leftOut > 0)
        console.warn(
            `excavation: ${leftOut} floor lights left out of blocks that more than ${LIGHTS_PER_BLOCK} reach; edges of light will show.`,
        );
    // The shader of a block depends on the number of its lights, and is compiled in the background the first time
    // the block is drawn: a block that comes into view later would stay black meanwhile. All of them now.
    await Promise.all(
        [...rockBlocks, ...walkwayBlocks].map((mesh) =>
            mesh.material?.forceCompilationAsync(mesh),
        ),
    );

    // The ground under the eyes: walkway or rock.
    const ground = new Set<AbstractMesh>([...rockBlocks, ...walkwayBlocks]);
    const down = new Vector3(0, -1, 0);
    let flying = false,
        relief = true;
    const requested = Number(params.get("speed"));
    let walk =
        Number.isFinite(requested) && requested > 0
            ? Math.min(FASTEST, Math.max(SLOWEST, requested))
            : WALK;
    let running = false;
    /** The speed on the ground or in flight now, metres a second. */
    const speedNow = (): number =>
        walk * (flying ? FLY : 1) * (running ? RUN : 1);
    scene.onBeforeRenderObservable.add(() => {
        // In a headset the camera of the page is not the one that draws: the viewer stands where they pointed.
        if (flying || scene.activeCamera !== camera) return;
        const seconds = Math.min(0.1, engine.getDeltaTime() / 1000);
        // From a metre over the eyes: on a steep ramp, taken fast, the eyes may dip under the ground for an image.
        const hit = scene.pickWithRay(
            new Ray(camera.position.add(new Vector3(0, 1, 0)), down, 60),
            (mesh) => ground.has(mesh),
        );
        if (!hit?.hit || !hit.pickedPoint) return;
        const wanted = hit.pickedPoint.y + EYES;
        // Up a step at once, down as a fall, both the faster as one goes faster: a ramp climbs up to 0.9 m a metre.
        const gap = wanted - camera.position.y;
        const pace = speedNow();
        camera.position.y +=
            gap > 0
                ? gap * Math.min(1, seconds * Math.max(14, 3 * pace))
                : Math.max(gap, -Math.max(12, 1.5 * pace) * seconds);
    });

    // Start in the small west cell, at the head of the walkway, looking along it.
    const first = layout.walkways[0]!.points;
    camera.position.set(first[0]!, first[1]! + EYES, first[2]!);
    camera.setTarget(
        new Vector3(
            first[12 * 3]!,
            first[12 * 3 + 1]! + EYES,
            first[12 * 3 + 2]!,
        ),
    );

    const ms = Math.round(performance.now() - started);
    const summary = `${layout.chambers.length} chambres, ${Math.round(layout.triangles / 1000)} k triangles en ${rockBlocks.length} blocs, ${lights.length} projecteurs, ${octaves} octaves${BAKED ? "" : " calculées"}, chargée en ${ms} ms.`;
    let filled = 0;
    /** Sets the speed of the camera from the speed on foot, running and flying, and tells it with the light. */
    const pace = (): void => {
        camera.speed = cameraSpeed(speedNow());
        status.textContent = `${summary} W A S D pour marcher, Maj pour courir, F pour voler, M relief par pixel, L éclairage (${FILLS[filled]!.name}). Vitesse ${Math.round(speedNow())} m/s${flying ? " en vol" : ""}, + et - pour la régler.`;
    };
    pace();
    window.addEventListener("keydown", (event) => {
        if (event.key === "Shift" && !running) {
            running = true;
            pace();
        }
        const key = event.key.toLowerCase();
        if (key === "+" || key === "=" || key === "-" || key === "_") {
            walk = Math.min(
                FASTEST,
                Math.max(
                    SLOWEST,
                    key === "+" || key === "=" ? walk * 1.5 : walk / 1.5,
                ),
            );
            pace();
        }
        if (key === "f") {
            flying = !flying;
            camera.checkCollisions = !flying;
            pace();
        }
        if (key === "m") {
            relief = !relief;
            Object.assign(
                rock.plugin.detail,
                relief ? detail : { strength: 0, cavity: 0, grain: 0 },
            );
        }
        if (key === "l") {
            filled = (filled + 1) % FILLS.length;
            fill.intensity = FILLS[filled]!.intensity;
            pace();
        }
    });
    window.addEventListener("keyup", (event) => {
        if (event.key === "Shift") {
            running = false;
            pace();
        }
    });
    // A key held when the page loses the keyboard is never let go of: no running left on.
    window.addEventListener("blur", () => {
        running = false;
        pace();
    });
    // Where the browser has a headset to give, the scene can be entered in it: the helper the examples of
    // spatial-display share, with the walkways as its ground. The viewer stands on them and goes where they point on
    // them; B or Y leaves, and the page leaves by itself when its images come too slowly.
    const walkway = walkwayGround(scene, ribbons);
    // The helper offers the headset to an address that has ?xr: the address gets it here, so that nothing has to be
    // typed.
    if (forHeadset && !params.has("xr")) {
        const address = new URL(location.href);
        address.searchParams.set("xr", "");
        history.replaceState(null, "", address);
    }
    const xr = await offerHeadset(scene, walkway);
    // Babylon.js sets the viewer over the place of the camera of the page, but at the height 0, which it takes for
    // the ground, and adds the height of the head at the first image. Here the ground is the walkway, far under 0:
    // the viewer is set at its height, under the camera of the page, before that first image.
    const headset = xr?.baseExperience as
        NonNullable<typeof xr>["baseExperience"] | undefined;
    headset?.onStateChangedObservable.add((state) => {
        if (state !== WebXRState.IN_XR) return;
        const session = headset.sessionManager;
        // The rock costs a lot for each pixel: fewer of them at the edges of the lenses, where the eye sees little.
        session.fixedFoveation = 1;
        // A Quest 3 asks for 90 images a second, and draws 45 when the page is a little late: it was, at 43. At 72
        // the page has a quarter more time for each image.
        if (session.supportedFrameRates?.includes(HEADSET_RATE))
            void session
                .updateTargetFrameRate(HEADSET_RATE)
                .catch(() => undefined);
    });
    headset?.onInitialXRPoseSetObservable.add((eyes) => {
        const under = scene.pickWithRay(
            new Ray(camera.position, down, 60),
            (mesh) => mesh === walkway,
        );
        eyes.position.y = under?.pickedPoint?.y ?? camera.position.y - EYES;
    });
    Object.assign(window, { scene, camera, rock, lights, xr });
}

engine.runRenderLoop(() => scene.render());
addEventListener("resize", () => engine.resize());
main().catch((error: unknown) => {
    status.textContent = `Erreur : ${String(error)}`;
    console.error(error);
});
