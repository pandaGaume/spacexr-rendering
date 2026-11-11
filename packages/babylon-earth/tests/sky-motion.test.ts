import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePhysicalScene } from "@spacexr/atmosphere";

const state = vi.hoisted(() => ({
    pose: {
        positionEcefMeters: [6378138, 0, 0],
        forwardEcef: [0, 1, 0],
        rightEcef: [0, 0, -1],
        upEcef: [1, 0, 0],
        halfWidthTangent: 1,
        halfHeightTangent: 1,
        viewportWidth: 768,
        viewportHeight: 576,
    },
    skies: [] as Array<{ updates: number; position: number[]; disposed: boolean }>,
    textures: [] as Array<{ vScale?: number; vOffset?: number }>,
    draws: [] as number[][],
    Engine: class {
        constructor(public _device: unknown) {}
        getRenderWidth() {
            return 800;
        }
        getRenderHeight() {
            return 600;
        }
        wrapWebGPUTexture() {
            return { _hardwareTexture: { createView() {} } };
        }
        updateTextureSamplingMode() {}
    },
}));
vi.mock("@babylonjs/core/Engines/webgpuEngine.js", () => ({ WebGPUEngine: state.Engine }));
vi.mock("@babylonjs/core/Layers/layer.js", () => ({
    Layer: class {
        isEnabled = false;
        texture = null;
        dispose() {}
    },
}));
vi.mock("@babylonjs/core/Materials/Textures/texture.js", () => ({
    Texture: class {
        static CLAMP_ADDRESSMODE = 0;
        vScale = 1;
        vOffset = 0;
        constructor() {
            state.textures.push(this);
        }
        dispose() {}
    },
}));
vi.mock("../src/atmosphere/camera", () => ({ atmosphereCamera: () => structuredClone(state.pose) }));
vi.mock("@spacexr/atmosphere/webgpu", () => ({
    atmosphereSkyWgsl: "",
    AtmosphereSky: class {
        updates = 0;
        position: number[] = [];
        disposed = false;
        private initial = 2;
        private ready = false;
        private encoders = new WeakSet<object>();
        constructor() {
            state.skies.push(this);
        }
        async createAerialVolume() {
            return { encode() {}, dispose() {} };
        }
        static async create() {
            return new this();
        }
        update(camera: typeof state.pose) {
            this.updates++;
            this.position = [...camera.positionEcefMeters];
            this.ready = false;
        }
        encode(encoder: object, budget: number) {
            if (this.encoders.has(encoder)) throw new Error("The public backend requires a submission between encodes");
            this.encoders.add(encoder);
            this.initial = Math.max(0, this.initial - (budget === 4096 ? 2 : 1));
            this.ready = this.initial === 0;
            return this.ready;
        }
        bindings() {
            if (!this.ready) throw new Error("Unfinished view published");
            return { layout: {}, group: { position: [...this.position] } };
        }
        dispose() {
            this.disposed = true;
        }
    },
}));
import { BabylonEarthSky } from "../src/atmosphere/babylon-sky";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";

function fixture() {
    const device = {
        lost: new Promise(() => {}),
        createBindGroupLayout: () => ({}),
        createBindGroup: () => ({}),
        createBuffer: () => ({ destroy() {} }),
        createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
        createPipelineLayout: () => ({}),
        createRenderPipelineAsync: async () => ({}),
        createTexture: ({ size }: { size: number[] }) => ({ width: size[0], height: size[1], createView: () => ({}), destroy() {} }),
        createCommandEncoder: vi.fn(() => ({
            beginRenderPass: () => ({
                setPipeline() {},
                setBindGroup(index: number, group: { position?: number[] }) {
                    if (index === 0) state.draws.push(group.position!);
                },
                draw() {},
                end() {},
            }),
            finish: () => ({}),
        })),
        queue: { writeBuffer: vi.fn(), submit: vi.fn(), onSubmittedWorkDone: vi.fn(async () => {}) },
    };
    const engine = new state.Engine(device);
    const scene = { getEngine: () => engine } as unknown as Scene;
    return { device, scene, camera: {} as Camera };
}
beforeEach(() => {
    vi.restoreAllMocks();
    state.skies.length = 0;
    state.textures.length = 0;
    state.draws.length = 0;
    state.pose.positionEcefMeters = [6378138, 0, 0];
    state.pose.forwardEcef = [0, 1, 0];
    vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2 });
    vi.stubGlobal("GPUTextureUsage", { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2 });
    vi.stubGlobal("GPUShaderStage", { FRAGMENT: 1 });
});
describe("atmosphere motion regressions", () => {
    it("keeps sky exposure stable before and after an explicit update without scene post-processes", async () => {
        const { scene, camera, device } = fixture();
        const sky = await BabylonEarthSky.create(scene, makePhysicalScene({ dustTau: 0 }, [1, 0, 0]).model, { exposure: 4 });
        for (let i = 0; i < 6; i++) await sky.update(camera);
        expect((device.queue.writeBuffer.mock.calls.at(-1)![2] as Float32Array)[14]).toBe(4);
        sky.setExposure(4);
        await sky.update(camera);
        expect((device.queue.writeBuffer.mock.calls.at(-1)![2] as Float32Array)[14]).toBe(4);
        sky.dispose();
    });
    it("never draws a cache anchored at an earlier position, even when moving during startup", async () => {
        const { scene, camera } = fixture();
        const sky = await BabylonEarthSky.create(scene, makePhysicalScene({ dustTau: 0 }, [1, 0, 0]).model, { aerialPerspective: false });
        for (let frame = 0; frame < 8; frame++) {
            state.pose.positionEcefMeters = [6378138, frame * 1000, 0];
            const previous = state.draws.length;
            await sky.update(camera);
            for (const drawn of state.draws.slice(previous)) expect(drawn).toEqual(state.pose.positionEcefMeters);
        }
        expect(state.draws.length).toBeGreaterThan(0);
        expect(sky.ready).toBe(true);
        sky.setEnabled(false);
        sky.dispose();
        expect(state.skies.every((s) => s.disposed)).toBe(true);
    });
    it("redraws orientation without rebuilding optical tables and flips the external WebGPU texture once", async () => {
        const { scene, camera, device } = fixture();
        const sky = await BabylonEarthSky.create(scene, makePhysicalScene({ dustTau: 0 }, [1, 0, 0]).model, { aerialPerspective: false });
        for (let frame = 0; frame < 6; frame++) await sky.update(camera);
        const updates = state.skies[0]!.updates;
        const draws = state.draws.length;
        state.pose.forwardEcef = [0, 0, 1];
        await sky.update(camera);
        expect(state.skies[0]!.updates).toBe(updates);
        expect(state.draws.length).toBeGreaterThan(draws);
        const upload = device.queue.writeBuffer.mock.calls.at(-1)!;
        expect(Array.from(upload[2] as Float32Array).slice(0, 3)).toEqual([0, 0, 1]);
        expect(state.textures[0]).toMatchObject({ vScale: -1, vOffset: 1, wrapU: 0, wrapV: 0 });
        sky.dispose();
    });
    it("keeps the moving cache during orientation-only motion", async () => {
        const { scene, camera } = fixture();
        let now = 0;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        const sky = await BabylonEarthSky.create(scene, makePhysicalScene({ dustTau: 0 }, [1, 0, 0]).model, { aerialPerspective: false });
        for (let frame = 0; frame < 6; frame++) await sky.update(camera);
        for (let frame = 1; frame < 5; frame++) {
            now += 1000;
            state.pose.forwardEcef = [0, Math.cos(frame), Math.sin(frame)];
            await sky.update(camera);
        }
        expect(state.skies[1]!.updates).toBe(0);
        now += 300;
        await sky.update(camera);
        expect(state.skies[1]!.updates).toBe(1);
        sky.dispose();
    });
    it("overlaps one GPU submission and waits before a third can accumulate", async () => {
        const { scene, camera, device } = fixture();
        const sky = await BabylonEarthSky.create(scene, makePhysicalScene({ dustTau: 0 }, [1, 0, 0]).model, { aerialPerspective: false });
        let release!: () => void;
        device.queue.onSubmittedWorkDone.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                release = resolve;
            }),
        );
        await sky.update(camera);
        device.queue.onSubmittedWorkDone.mockReturnValueOnce(new Promise<void>(() => {}));
        await sky.update(camera);
        const submitted = device.queue.submit.mock.calls.length;
        const next = sky.update(camera);
        await Promise.resolve();
        expect(device.queue.submit.mock.calls.length).toBe(submitted);
        release();
        await next;
        expect(device.queue.submit.mock.calls.length).toBe(submitted + 1);
        sky.dispose();
    });
});
