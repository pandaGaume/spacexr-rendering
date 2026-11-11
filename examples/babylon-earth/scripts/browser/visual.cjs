const fs = require("node:fs");
const { runBrowserTest } = require("./test-support.cjs");
runBrowserTest("visual", async ({ browser, output, baseUrl }) => {
    const results = [];
    async function settle(page) {
        await page.evaluate(() => {
            window.visualIdleSince = performance.now();
        });
        await page.waitForFunction(
            () => {
                if (
                    !window.earthDemo?.earth.atmosphereReady ||
                    window.earthDemo.earth.runtime.instrumentation.snapshot().pendingLoads !== 0
                ) {
                    window.visualIdleSince = performance.now();
                    return false;
                }
                return performance.now() - window.visualIdleSince >= 1000;
            },
            null,
            { timeout: 90000, polling: 100 },
        );
    }
    async function capture(page, name, errors) {
        const state = await page.evaluate(async () => {
            const e = window.earthDemo.earth,
                t = e.terrain,
                s = e.camera.getScene();
            const pages = t.imageryPages,
                missingImagery = [],
                missingGpuBindings = [];
            if (!pages || !t.drape) throw new Error("The imagery validation requires the existing raster pages.");
            const texture = t.drape.tables.getInternalTexture();
            for (const address of t.geometryTiles) {
                if (!pages.resident.has(address)) missingImagery.push(address);
                const binding = t.drape.binding(address);
                if (!binding || binding.tableLayer < 0) {
                    missingGpuBindings.push(address);
                    continue;
                }
                const data = await s
                    .getEngine()
                    ._textureHelper.readPixels(
                        texture._hardwareTexture.underlyingResource,
                        0,
                        0,
                        1,
                        1,
                        texture._hardwareTexture.format,
                        binding.tableLayer,
                        0,
                        null,
                        true,
                    );
                if (new Float32Array(data.buffer, data.byteOffset, 4)[0] < 0) missingGpuBindings.push(address);
            }
            return {
                errors: window.earthDemo.errors,
                gpuErrors: window.visualGpuErrors,
                post: e.camera._postProcesses.filter(Boolean).length,
                apply: s.imageProcessingConfiguration.applyByPostProcess,
                pending: e.runtime.instrumentation.snapshot().pendingLoads,
                tiles: t.getStatistics().presented,
                missingImagery,
                missingGpuBindings,
                sameRuntime: e.runtime === window.visualReferenceRuntime,
            };
        });
        await page.screenshot({ path: `${output}/${name}.png` });
        results.push({ name, pageErrors: [...errors], ...state });
        console.log(JSON.stringify(results.at(-1)));
        fs.writeFileSync(`${output}/result.json`, JSON.stringify(results, null, 2));
        if (
            errors.length ||
            state.errors.length ||
            state.gpuErrors.length ||
            state.post ||
            state.apply ||
            state.pending ||
            state.missingImagery.length ||
            state.missingGpuBindings.length ||
            !state.sameRuntime
        )
            throw new Error(`Visual imagery validation failed: ${name}`);
    }
    for (const [name, path] of [
        ["day", "atmosphere.html?hour=10&sse=20"],
        ["sunset", "atmosphere.html?sunset=1&sse=20"],
        ["orbit", "orbital.html?view=horizon&sse=20"],
    ]) {
        const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } }),
            errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        await page.addInitScript(() => {
            const original = GPUAdapter.prototype.requestDevice;
            GPUAdapter.prototype.requestDevice = async function (...args) {
                const device = await original.apply(this, args);
                window.visualGpuErrors = [];
                device.addEventListener("uncapturederror", (event) => window.visualGpuErrors.push(event.error.message));
                return device;
            };
        });
        await page.goto(`${baseUrl}/${path}`);
        await page.waitForFunction(() => window.earthDemo?.earth.atmosphereReady, null, { timeout: 90000 });
        await page.evaluate(() => {
            window.visualReferenceRuntime = window.earthDemo.earth.runtime;
        });
        await settle(page);
        await capture(page, name, errors);
        if (name === "orbit") {
            for (const [view, resultName] of [
                ["terrain", "terrain-navigation"],
                ["orbit", "globe-return"],
                ["terrain", "terrain-return"],
            ]) {
                await page.click(`#${view}`);
                if (view === "terrain")
                    await page.evaluate(async () => {
                        const camera = window.earthDemo.earth.camera,
                            yaw = camera.yaw,
                            start = performance.now();
                        const timer = setInterval(() => {
                            camera.yaw = yaw + (performance.now() - start) * 0.0001;
                        }, 8);
                        try {
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        } finally {
                            clearInterval(timer);
                        }
                    });
                await settle(page);
                await capture(page, resultName, errors);
            }
        }
        await page.evaluate(() => window.earthDemo.dispose());
        await page.close();
    }
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
