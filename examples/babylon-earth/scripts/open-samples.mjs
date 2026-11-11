import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureSampleServer } from "./sample-server.mjs";

const run = promisify(execFile);
async function openPage(url) {
    console.log(url);
    if (process.env.BROWSER === "none") return;
    if (process.platform === "win32") await run("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true });
    else if (process.platform === "darwin") await run("open", [url]);
    else await run("xdg-open", [url]);
}

const server = await ensureSampleServer();
let closing = false;
async function close() {
    if (closing) return;
    closing = true;
    await server.close();
}
process.once("SIGINT", () => {
    void close();
});
process.once("SIGTERM", () => {
    void close();
});
try {
    await openPage(`${server.baseUrl}/orbital.html?view=horizon&sse=20`);
    await openPage(`${server.baseUrl}/atmosphere.html?hour=10&sse=20`);
} catch (error) {
    await close();
    throw error;
}
