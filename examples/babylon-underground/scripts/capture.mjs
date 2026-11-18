// Captures the views of the example in headless Chrome, on the GPU of the machine, and measures the frame time.
// Start the example first (npm run dev in this folder), then: node scripts/capture.mjs [--url http://127.0.0.1:5193/]
// Writes PNG files and measurements.json to screenshots/. Needs Node.js 22 (global WebSocket) and Chrome.
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? process.argv[index + 1] : fallback;
};
const url = argument("url", "http://127.0.0.1:5193/");
const width = Number(argument("width", 1280));
const height = Number(argument("height", 800));
const out = fileURLToPath(new URL("../screenshots/", import.meta.url));
const chrome = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
].find((path) => path && existsSync(path));
if (!chrome) throw new Error("No Chrome found: set CHROME_PATH.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 9333;
const browser = spawn(
    chrome,
    [
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${mkdtempSync(join(tmpdir(), "rock-capture-"))}`,
        `--window-size=${width},${height}`,
        "--force-device-scale-factor=1",
        "--use-angle=d3d11",
        "--ignore-gpu-blocklist",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--no-first-run",
        "about:blank",
    ],
    { stdio: "ignore" },
);
const stop = () => {
    try {
        if (process.platform === "win32") execSync(`taskkill /PID ${browser.pid} /T /F`, { stdio: "ignore" });
        else browser.kill();
    } catch {
        // Already gone.
    }
};

let version;
for (let attempt = 0; attempt < 50 && !version; attempt++) {
    await sleep(200);
    version = await fetch(`http://127.0.0.1:${port}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined);
}
if (!version) {
    stop();
    throw new Error("Chrome did not start.");
}

const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
});
let nextId = 1;
const pending = new Map();
const errors = [];
socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        errors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
    }
};
const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Runtime.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send("Page.navigate", { url }, sessionId);
    const evaluate = async (expression) => {
        const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800));
        return result.result.value;
    };
    for (let attempt = 0; attempt < 120; attempt++) {
        await sleep(500);
        if (await evaluate("!!window.__ROCK_EXAMPLE__?.ready")) break;
        if (errors.length) throw new Error(errors.join("\n"));
    }
    if (!(await evaluate("!!window.__ROCK_EXAMPLE__?.ready"))) throw new Error(`The page did not start: ${await evaluate("document.getElementById('status')?.textContent")}`);
    mkdirSync(out, { recursive: true });
    const shoot = async (name) => {
        await sleep(400);
        const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
        writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
        console.log(`screenshots/${name}.png`);
    };
    await evaluate("document.getElementById('panel').classList.add('hidden')");
    const measurements = {};
    for (const preset of ["near", "mid", "far"]) {
        await evaluate(`window.__ROCK_EXAMPLE__.setPreset("${preset}")`);
        await shoot(`${preset}`);
        measurements[preset] = await evaluate("window.__ROCK_EXAMPLE__.measure()");
        await evaluate("window.__ROCK_EXAMPLE__.setRockEnabled(false)");
        await shoot(`${preset}-plain-pbr`);
        await evaluate("window.__ROCK_EXAMPLE__.setRockEnabled(true)");
        // Each layer alone.
        for (const [layer, label] of [["macro", "a"], ["meso", "b"], ["micro", "c"]]) {
            await evaluate(`(() => { const s = window.__ROCK_EXAMPLE__.settings(); s.macro.enabled = ${layer === "macro"}; s.meso.enabled = ${layer === "meso"}; s.micro.enabled = ${layer === "micro"}; return window.__ROCK_EXAMPLE__.setSettings(s); })()`);
            await shoot(`${preset}-only-${label}-${layer}`);
        }
        await evaluate("(() => { const s = window.__ROCK_EXAMPLE__.settings(); s.macro.enabled = s.meso.enabled = s.micro.enabled = true; return window.__ROCK_EXAMPLE__.setSettings(s); })()");
        // A small turn of the camera, to compare two neighbouring frames for shimmer.
        await evaluate("window.__ROCK_EXAMPLE__.orbit(0.004)");
        await shoot(`${preset}-turned`);
        await evaluate("window.__ROCK_EXAMPLE__.orbit(-0.004)");
    }
    const renderer = await evaluate(
        "(() => { const gl = document.createElement('canvas').getContext('webgl2'); const info = gl.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()",
    );
    writeFileSync(join(out, "measurements.json"), JSON.stringify({ url, width, height, renderer, measurements, errors }, null, 4));
    console.log(JSON.stringify({ renderer, measurements, errors }, null, 2));
} finally {
    socket.close();
    stop();
}
