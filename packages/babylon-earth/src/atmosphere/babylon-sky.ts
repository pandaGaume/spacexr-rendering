import { BabylonAtmosphereSurface } from "./native-surface";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { AtmosphereAerialVolume, IAtmosphereAerialOptions } from "@spacexr/atmosphere/webgpu";
/// <reference types="@webgpu/types" />
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { WebGPUHardwareTexture } from "@babylonjs/core/Engines/WebGPU/webgpuHardwareTexture.js";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.js";
import { Layer } from "@babylonjs/core/Layers/layer.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { makeSpectralScene } from "@spacexr/atmosphere";
import type { IAtmosphere } from "@spacexr/atmosphere";
import { AtmosphereSky, atmosphereSkyWgsl, type IAtmosphereCamera, type IAtmosphereSkyOptions } from "@spacexr/atmosphere/webgpu";
import { atmosphereCamera } from "./camera";
import { displayShader } from "./generated/display";

export interface IEarthAtmosphereOptions {
    /** Apply finite-distance transport in the native GPU terrain fragment shader. Default true. False is the diagnostic sky-only path. */
    aerialPerspective?: boolean;
    /** Bounded finite-distance spectral volume quality. */
    aerialQuality?: IAtmosphereAerialOptions;
    /** Public spectral backend quality. Defaults favour an interactive desktop preview. */
    quality?: IAtmosphereSkyOptions;
    /** Bounded per-frame moving-view quality. Solar and spectral settings stay shared with quality. */
    motionQuality?: Pick<IAtmosphereSkyOptions, "width" | "hemisphereRows" | "viewSteps">;
    /** Sky display cache width, in pixels. Defaults to min(viewport width, 1024). */
    width?: number;
    /** Native atmosphere display exposure, default 4. Does not alter physical coefficients. */
    exposure?: number;
    /** Construction tasks submitted per update. Default 2. */
    dispatchesPerFrame?: number;
}

/** Internal Babylon bridge. Scattering and LUT construction stay in @spacexr/atmosphere. */
export class BabylonEarthSky {
    private readonly layer: Layer;
    private readonly surfaces: BabylonAtmosphereSurface[] = [];
    private motionAerial: AtmosphereAerialVolume | undefined;
    private settledAerial: AtmosphereAerialVolume | undefined;
    private texture: Texture | undefined;
    private output: GPUTexture | undefined;
    private uniform: GPUBuffer;
    private pipeline: GPURenderPipeline | undefined;
    private compiling: Promise<void> | undefined;
    private group: GPUBindGroup | undefined;
    private readonly cameraLayout: GPUBindGroupLayout;
    private motionBuilding: IAtmosphereCamera | undefined;
    private settledBaked: IAtmosphereCamera | undefined;
    private settledBuilding: IAtmosphereCamera | undefined;
    private lastMotionAt = 0;
    private lastPose: IAtmosphereCamera | undefined;
    private lastDisplayKey = "";
    private lastDisplaySky: AtmosphereSky | undefined;
    private motionReady = false;
    private readonly pending: Promise<void>[] = [];
    private disposed = false;
    private failure: unknown;
    private enabled = true;
    private exposure: number;
    private readonly solarAngularRadius: number;
    public ready = false;
    private constructor(
        private readonly scene: Scene,
        private readonly engine: WebGPUEngine,
        private readonly device: GPUDevice,
        private readonly motionSky: AtmosphereSky,
        private readonly settledSky: AtmosphereSky,
        private readonly model: IAtmosphere,
        private readonly options: IEarthAtmosphereOptions,
    ) {
        this.exposure = options.exposure ?? (options.aerialPerspective === false ? 12 : 4);
        this.solarAngularRadius = makeSpectralScene(model, options.quality).solarAngularRadius;
        this.layer = new Layer("earth-atmosphere", null, scene, true);
        this.layer.isEnabled = false;
        this.cameraLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });
        this.uniform = device.createBuffer({
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.group = device.createBindGroup({
            layout: this.cameraLayout,
            entries: [{ binding: 0, resource: { buffer: this.uniform } }],
        });
        const weak = new WeakRef(this);
        void device.lost.then((info) => {
            const target = weak.deref();
            if (target && !target.disposed) target.failure = new Error(`Atmosphere GPU lost: ${info.message}`);
        });
    }
    public static async create(scene: Scene, model: IAtmosphere, options: IEarthAtmosphereOptions = {}): Promise<BabylonEarthSky> {
        const engine = scene.getEngine();
        if (!(engine instanceof WebGPUEngine))
            throw new Error("Earth atmospheric rendering currently requires Babylon WebGPU. Pass atmosphere:false for WebGL terrain.");
        const width = options.width ?? 768,
            exposure = options.exposure ?? (options.aerialPerspective === false ? 12 : 4),
            dispatches = options.dispatchesPerFrame ?? 2;
        if (
            !Number.isInteger(width) ||
            width < 64 ||
            width > 4096 ||
            !Number.isFinite(exposure) ||
            exposure <= 0 ||
            !Number.isInteger(dispatches) ||
            dispatches < 1 ||
            dispatches > 4096
        )
            throw new RangeError("Invalid Earth atmosphere display quality.");
        // Babylon 9.33 exposes no public device getter. Keep this version-dependent bridge isolated here.
        const device = engine._device;
        const quality = { multipleScattering: true, width: 64, hemisphereRows: 32, viewSteps: 64, solarSteps: 48, ...options.quality };
        const motion = await AtmosphereSky.create(device, model, {
            ...quality,
            width: 16,
            hemisphereRows: 8,
            viewSteps: 16,
            ...options.motionQuality,
        });
        let settled: AtmosphereSky | undefined;
        let motionAerial: AtmosphereAerialVolume | undefined;
        let settledAerial: AtmosphereAerialVolume | undefined;
        let bridge: BabylonEarthSky | undefined;
        try {
            settled = await AtmosphereSky.create(device, model, quality);
            if (options.aerialPerspective !== false) {
                motionAerial = await motion.createAerialVolume({
                    width: 16,
                    height: 9,
                    depth: 24,
                    segmentSteps: 2,
                    ...options.aerialQuality,
                });
                settledAerial = await settled.createAerialVolume({ depth: 32, segmentSteps: 2, ...options.aerialQuality });
            }
            bridge = new BabylonEarthSky(scene, engine, device, motion, settled, model, options);
            bridge.motionAerial = motionAerial;
            bridge.settledAerial = settledAerial;
            return bridge;
        } catch (error) {
            bridge?.dispose();
            motionAerial?.dispose();
            settledAerial?.dispose();
            motion.dispose();
            settled?.dispose();
            throw error;
        }
    }
    public attachTerrain(material: ShaderMaterial, lightScale?: number): void {
        if (this.options.aerialPerspective === false) return;
        this.lastDisplayKey = "";
        const surface = new BabylonAtmosphereSurface(this.scene, this.engine, material, this.model, this.options.quality, lightScale);
        this.surfaces.push(surface);
        surface.setEnabled(this.enabled);
    }
    public setEnabled(value: boolean): void {
        this.enabled = value;
        this.lastDisplayKey = "";
        this.layer.isEnabled = value && this.ready;
        for (const surface of this.surfaces) surface.setEnabled(value);
    }
    public setExposure(value: number): void {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("Exposure must be positive.");
        this.exposure = value;
    }
    /** Completes one exact-position moving cache before drawing; refines a separate cache only at rest. */
    public async update(camera: Camera): Promise<void> {
        if (this.disposed) throw new Error("Earth atmosphere is disposed.");
        if (this.failure) throw this.failure;
        if (!this.enabled) return;
        // Bound the queue while allowing CPU encoding to overlap the preceding GPU frame.
        const width = this.options.width ?? Math.min(1024, this.engine.getRenderWidth());
        const height = Math.max(1, Math.round((width * this.engine.getRenderHeight()) / this.engine.getRenderWidth()));
        const current = atmosphereCamera(camera, width, height);
        const samePosition = (a: IAtmosphereCamera | undefined) =>
            a !== undefined && Math.hypot(...current.positionEcefMeters.map((v, i) => v - a.positionEcefMeters[i]!)) < 0.001;
        const displayKey = JSON.stringify([
            current.positionEcefMeters,
            current.forwardEcef,
            current.rightEcef,
            current.upEcef,
            current.halfWidthTangent,
            current.halfHeightTangent,
            width,
            height,
            this.exposure,
        ]);
        if (this.ready && samePosition(this.settledBaked) && this.lastDisplaySky === this.settledSky && displayKey === this.lastDisplayKey)
            return;
        if (this.pending.length >= 2) await this.pending[0];
        if (this.disposed || !this.enabled) return;
        const previous = this.lastPose;
        const changed =
            !samePosition(previous) ||
            !previous ||
            current.forwardEcef.some((v, i) => v !== previous.forwardEcef[i]) ||
            current.rightEcef.some((v, i) => v !== previous.rightEcef[i]) ||
            current.upEcef.some((v, i) => v !== previous.upEcef[i]) ||
            current.halfWidthTangent !== previous.halfWidthTangent ||
            current.halfHeightTangent !== previous.halfHeightTangent;
        if (changed) {
            this.lastMotionAt = performance.now();
            this.lastPose = current;
        }
        const encoder = this.device.createCommandEncoder({ label: "Earth sky, current camera" });
        if (!this.motionBuilding || (this.motionReady && !samePosition(this.motionBuilding))) {
            this.motionSky.update(current);
            this.motionBuilding = current;
        }
        if (this.motionSky.encode(encoder, this.motionReady ? 4096 : (this.options.dispatchesPerFrame ?? 2))) {
            this.motionReady = true;
        }
        let active = this.motionReady && samePosition(this.motionBuilding) ? this.motionSky : undefined;
        if (this.motionReady && performance.now() - this.lastMotionAt >= 250) {
            if (!samePosition(this.settledBaked)) {
                if (!samePosition(this.settledBuilding)) {
                    this.settledSky.update(current);
                    this.settledBuilding = current;
                }
                if (this.settledSky.encode(encoder, this.options.dispatchesPerFrame ?? 2)) this.settledBaked = current;
            }
            if (samePosition(this.settledBaked)) active = this.settledSky;
        }
        if (active && this.surfaces.length) {
            const volume = active === this.motionSky ? this.motionAerial! : this.settledAerial!;
            volume.encode(encoder, current);
            for (const surface of this.surfaces) surface.update(volume, current, this.exposure);
        }
        if (active) {
            if (!this.pipeline && !this.compiling)
                this.compiling = this.compile(active).catch((error) => {
                    this.failure = error;
                });
            if (this.pipeline && (displayKey !== this.lastDisplayKey || active !== this.lastDisplaySky)) {
                this.resize(width, height);
                this.device.queue.writeBuffer(
                    this.uniform,
                    0,
                    new Float32Array([
                        ...current.forwardEcef,
                        0,
                        ...current.rightEcef,
                        current.halfWidthTangent,
                        ...current.upEcef,
                        current.halfHeightTangent,
                        width,
                        height,
                        this.exposure,
                        0,
                        ...this.model.sun,
                        this.solarAngularRadius,
                    ]),
                );
                const pass = encoder.beginRenderPass({
                    colorAttachments: [
                        { view: this.output!.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } },
                    ],
                });
                pass.setPipeline(this.pipeline);
                pass.setBindGroup(0, active.bindings().group);
                pass.setBindGroup(1, this.group!);
                pass.draw(3);
                pass.end();
                this.ready = true;
                this.layer.isEnabled = true;
                this.lastDisplayKey = displayKey;
                this.lastDisplaySky = active;
            }
        }
        this.device.queue.submit([encoder.finish()]);
        const completion = this.device.queue
            .onSubmittedWorkDone()
            .catch((error) => {
                this.failure = error;
            })
            .finally(() => {
                const index = this.pending.indexOf(completion);
                if (index >= 0) this.pending.splice(index, 1);
            });
        this.pending.push(completion);
    }
    private async compile(sky: AtmosphereSky): Promise<void> {
        const layout = sky.bindings().layout;
        const module = this.device.createShaderModule({
            code: atmosphereSkyWgsl + displayShader,
            label: "Earth sky display",
        });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter((m) => m.type === "error");
        if (errors.length) throw new Error(errors.map((m) => m.message).join("\n"));
        const pipeline = await this.device.createRenderPipelineAsync({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [layout, this.cameraLayout],
            }),
            vertex: { module, entryPoint: "vertexMain" },
            fragment: {
                module,
                entryPoint: "fragmentMain",
                targets: [{ format: "rgba8unorm" }],
            },
        });
        if (!this.disposed) this.pipeline = pipeline;
    }
    private resize(width: number, height: number): void {
        if (this.output?.width === width && this.output.height === height) return;
        this.layer.texture = null;
        this.texture?.dispose();
        this.output?.destroy();
        this.output = this.device.createTexture({
            label: "Earth sky display",
            size: [width, height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        const internal = this.engine.wrapWebGPUTexture(this.output);
        (internal._hardwareTexture as WebGPUHardwareTexture).createView({
            dimension: "2d",
        });
        this.engine.updateTextureSamplingMode(2, internal);
        this.texture = new Texture(null, this.scene, { internalTexture: internal, noMipmap: true, samplingMode: 2, invertY: false });
        // WebGPU render-target rows run top to bottom; Babylon Layer UVs run bottom to top.
        this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        this.texture.vScale = -1;
        this.texture.vOffset = 1;
        this.texture.gammaSpace = true;
        this.layer.texture = this.texture;
    }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.layer.texture = null;
        this.layer.dispose();
        this.texture?.dispose();
        this.output?.destroy();
        this.uniform.destroy();
        for (const surface of this.surfaces) surface.dispose();
        this.surfaces.length = 0;
        this.motionAerial?.dispose();
        this.settledAerial?.dispose();
        this.motionSky.dispose();
        this.settledSky.dispose();
    }
}
