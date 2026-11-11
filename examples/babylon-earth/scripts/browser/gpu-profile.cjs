const fs = require("node:fs");
const { runBrowserTest } = require("./test-support.cjs");
runBrowserTest("gpu", async ({ browser, output, baseUrl }) => {
    const reports = [];
    for (const absent of [true, false]) {
        const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } }),
            errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
            if (m.type() === "error") errors.push(m.text());
        });
        await page.addInitScript(() => {
            const request = GPUAdapter.prototype.requestDevice;
            GPUAdapter.prototype.requestDevice = async function (...args) {
                const device = await request.apply(this, args);
                window.gpuAuditErrors = [];
                device.addEventListener("uncapturederror", (e) => window.gpuAuditErrors.push(e.error.message));
                const create = device.createCommandEncoder.bind(device);
                device.createCommandEncoder = (desc) => {
                    const encoder = create(desc);
                    for (const method of ["beginComputePass", "beginRenderPass"]) {
                        const begin = encoder[method].bind(encoder);
                        encoder[method] = (desc2) => {
                            if (window.audit?.active && window.audit.names.length < 2000) {
                                const index = 2 + window.audit.names.length * 2;
                                window.audit.names.push({
                                    label: (desc2?.label || desc?.label || method).replace(/^\[.*?\] - /, ""),
                                    frame: window.earthDemo?.frames,
                                });
                                desc2 = {
                                    ...desc2,
                                    timestampWrites: {
                                        querySet: window.audit.query,
                                        beginningOfPassWriteIndex: index,
                                        endOfPassWriteIndex: index + 1,
                                    },
                                };
                            }
                            return begin(desc2);
                        };
                    }
                    return encoder;
                };
                return device;
            };
        });
        await page.goto(baseUrl + "/orbital.html?view=horizon&sse=20" + (absent ? "&atmosphere=0" : ""));
        await page.waitForFunction(() => window.earthDemo?.frames > 40, null, { timeout: 90000 });
        if (!absent) await page.waitForFunction(() => window.earthDemo.earth.atmosphereReady, null, { timeout: 90000 });
        await page.waitForTimeout(5000);
        const report = await page.evaluate(async (absent) => {
            const demo = window.earthDemo,
                earth = demo.earth,
                camera = earth.camera,
                scene = camera.getScene(),
                engine = scene.getEngine(),
                device = engine._device;
            const rows = [],
                cpu = {};
            const record = (label, ms, extra = {}) => {
                if (window.audit?.active) (cpu[label] ??= []).push({ frame: demo.frames, ms, ...extra });
            };
            for (const [object, key, label] of [
                [earth, "update", "runtime.update"],
                [scene, "render", "scene.render"],
                [camera, "update", "camera.update"],
                [earth.terrain, "beforeRender", "terrain.beforeRender"],
                [device.queue, "submit", "queue.submit"],
            ]) {
                const original = object[key].bind(object);
                object[key] = function (...args) {
                    const start = performance.now(),
                        result = original(...args);
                    if (result?.then) return result.finally(() => record(label, performance.now() - start));
                    record(label, performance.now() - start);
                    return result;
                };
            }
            if (!absent) {
                const { BabylonEarthSky } = await import(
                    performance.getEntriesByType("resource").find((e) => e.name.includes("/src/atmosphere/babylon-sky.ts")).name
                );
                const original = BabylonEarthSky.prototype.update;
                BabylonEarthSky.prototype.update = async function (...args) {
                    const start = performance.now();
                    let wait = 0;
                    const pending = this.pending.length;
                    if (pending >= 2)
                        this.pending[0].then(() => {
                            wait = performance.now() - start;
                        });
                    await original.apply(this, args);
                    record("sky.update", performance.now() - start, { pending, wait });
                };
            }
            const rafIntervals = [];
            let previousRaf = 0,
                cadenceFrame;
            const sampleCadence = (now) => {
                if (previousRaf && window.audit?.active) rafIntervals.push(now - previousRaf);
                previousRaf = now;
                cadenceFrame = requestAnimationFrame(sampleCadence);
            };
            cadenceFrame = requestAnimationFrame(sampleCadence);
            const baseYaw = camera.yaw;
            const summarize = (values) => {
                const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
                return {
                    n: sorted.length,
                    median: sorted[Math.floor(sorted.length * 0.5)],
                    p95: sorted[Math.floor(sorted.length * 0.95)],
                    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
                };
            };
            for (const enabled of absent ? [false] : [false, true, false]) {
                camera.yaw = baseYaw;
                if (!absent) {
                    const box = document.querySelector("#atmosphere");
                    box.checked = enabled;
                    box.dispatchEvent(new Event("change"));
                }
                await new Promise((r) => setTimeout(r, 2500));
                const motionStart = performance.now(),
                    motion = setInterval(() => (camera.yaw = baseYaw + (performance.now() - motionStart) * 0.0001), 8);
                await new Promise((r) => setTimeout(r, 1200));
                await device.queue.onSubmittedWorkDone();
                for (const key in cpu) delete cpu[key];
                if (!device.features.has("timestamp-query")) throw new Error("GPU profiling requires timestamp-query support.");
                const query = device.createQuerySet({ type: "timestamp", count: 4096 });
                window.audit = { active: true, query, names: [] };
                rafIntervals.length = 0;
                const start = performance.now(),
                    frames = demo.frames;
                await new Promise((r) => setTimeout(r, 2500));
                window.audit.active = false;
                const fps = (1000 * (demo.frames - frames)) / (performance.now() - start);
                clearInterval(motion);
                const count = 2 + window.audit.names.length * 2;
                const buffer = device.createBuffer({ size: 32768, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
                    read = device.createBuffer({ size: 32768, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                const encoder = device.createCommandEncoder();
                encoder.resolveQuerySet(query, 0, count, buffer, 0);
                encoder.copyBufferToBuffer(buffer, 0, read, 0, count * 8);
                device.queue.submit([encoder.finish()]);
                await read.mapAsync(GPUMapMode.READ);
                const values = new BigUint64Array(read.getMappedRange()),
                    gpu = {},
                    counts = {},
                    lost = {};
                for (let i = 0; i < window.audit.names.length; i++) {
                    const { label, frame } = window.audit.names[i],
                        a = values[2 + 2 * i],
                        b = values[3 + 2 * i],
                        ms = Number(b - a) / 1e6;
                    (counts[label] ??= {})[frame] = ((counts[label] ?? {})[frame] ?? 0) + 1;
                    if (a === 0n || b < a || ms > 100) {
                        lost[label] = (lost[label] ?? 0) + 1;
                        continue;
                    }
                    (gpu[label] ??= {})[frame] = ((gpu[label] ?? {})[frame] ?? 0) + ms;
                }
                const gpuSummary = Object.fromEntries(
                    Object.entries(gpu).map(([label, frames]) => [label, summarize(Object.values(frames))]),
                );
                const cpuSummary = Object.fromEntries(
                    Object.entries(cpu).map(([label, items]) => [
                        label,
                        {
                            ...summarize(items.map((v) => v.ms)),
                            ...(label === "sky.update"
                                ? {
                                      wait: summarize(items.map((v) => v.wait)),
                                      pending: items.reduce((s, v) => ((s[v.pending] = (s[v.pending] ?? 0) + 1), s), {}),
                                  }
                                : {}),
                        },
                    ]),
                );
                rows.push({
                    enabled,
                    fps,
                    browserFrameInterval: summarize(rafIntervals),
                    cpu: cpuSummary,
                    gpu: gpuSummary,
                    passesPerFrame: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, summarize(Object.values(v))])),
                    lostTimestamps: lost,
                });
                read.unmap();
                query.destroy();
                read.destroy();
                buffer.destroy();
            }
            cancelAnimationFrame(cadenceFrame);
            return {
                adapter: engine.getInfo(),
                userAgent: navigator.userAgent,
                absent,
                rows,
                width: engine.getRenderWidth(),
                height: engine.getRenderHeight(),
                post: camera._postProcesses.filter(Boolean).length,
                errors: demo.errors,
                gpuErrors: window.gpuAuditErrors,
                gpuFeatures: Array.from(device.features),
            };
        }, absent);
        if (
            errors.length ||
            report.errors.length ||
            report.gpuErrors.length ||
            report.post ||
            report.rows.some((row) => !Number.isFinite(row.fps) || row.fps <= 0)
        ) {
            throw new Error("Babylon Earth browser validation failed: " + JSON.stringify({ errors, ...report }));
        }
        if (
            report.rows.some(
                (row) =>
                    !row.gpu.MainRenderPass || (!row.enabled && Object.keys(row.gpu).some((name) => /Atmosphere|Earth sky/.test(name))),
            )
        ) {
            throw new Error("Missing GPU timestamps or atmospheric GPU work while OFF.");
        }
        reports.push({ errors, ...report });
        console.log(JSON.stringify(reports.at(-1), null, 2));
        fs.writeFileSync(output + "/result.json", JSON.stringify(reports, null, 2));
        await page.evaluate(() => window.earthDemo.dispose());
        await page.close();
    }
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
