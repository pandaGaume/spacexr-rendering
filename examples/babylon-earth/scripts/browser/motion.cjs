const fs = require("node:fs");
const { runBrowserTest } = require("./test-support.cjs");
runBrowserTest("motion", async ({ browser, output, baseUrl }) => {
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
                rafIntervals.length = 0;
                window.audit = { active: true };
                const start = performance.now(),
                    frames = demo.frames;
                await new Promise((r) => setTimeout(r, 5000));
                window.audit.active = false;
                const fps = (1000 * (demo.frames - frames)) / (performance.now() - start);
                clearInterval(motion);
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
                    missingImagery: earth.terrain.geometryTiles.filter((address) => !earth.terrain.imageryPages.resident.has(address)),
                });
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
            };
        }, absent);
        if (
            errors.length ||
            report.errors.length ||
            report.gpuErrors.length ||
            report.post ||
            report.rows.some((row) => !Number.isFinite(row.fps) || row.fps <= 0 || row.missingImagery.length)
        ) {
            throw new Error("Babylon Earth browser validation failed: " + JSON.stringify({ errors, ...report }));
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
