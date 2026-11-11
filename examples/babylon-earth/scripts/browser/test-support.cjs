const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const fs = require("node:fs");

function loadChromium() {
    try {
        return require("playwright").chromium;
    } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
    // Reuse the already installed scientific browser toolchain; no additional dependency.
    const atmosphere = createRequire(require.resolve("@spacexr/atmosphere/package.json"));
    try {
        return atmosphere("playwright").chromium;
    } catch (error) {
        throw new Error("Install the existing atmosphere-core development dependencies with npm ci before running browser checks.", {
            cause: error,
        });
    }
}

exports.runBrowserTest = async (name, test) => {
    const chromium = loadChromium();
    const { ensureSampleServer, renderingRoot } = await import("../sample-server.mjs");
    const server = await ensureSampleServer();
    const output = resolve(renderingRoot, ".cache", "babylon-earth", name);
    fs.mkdirSync(output, { recursive: true });
    let browser;
    try {
        browser = await chromium.launch({
            channel: "chrome",
            headless: true,
            args: ["--enable-unsafe-webgpu", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : []), "--ignore-gpu-blocklist"],
        });
        await test({ browser, output, baseUrl: server.baseUrl });
        console.log(`Results: ${output}`);
    } finally {
        try {
            await browser?.close();
        } finally {
            await server.close();
        }
    }
};
