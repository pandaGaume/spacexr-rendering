import { createServer } from "vite";
import { fileURLToPath } from "node:url";

export const sampleRoot = fileURLToPath(new URL("../", import.meta.url));
export const renderingRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const atmosphereRoot = fileURLToPath(new URL("../../../../atmosphere-core/", import.meta.url));
export const sampleUrl = "http://127.0.0.1:5189";

export async function ensureSampleServer() {
    await import("../../../packages/babylon-earth/scripts/build-shader.mjs");
    let response;
    try {
        response = await fetch(`${sampleUrl}/src/main.ts`, { signal: AbortSignal.timeout(2000) });
    } catch (error) {
        if (error.name === "TimeoutError") throw new Error(`Port 5189 is occupied but does not answer: ${error.message}`);
        if (error.cause?.code !== "ECONNREFUSED") throw error;
    }
    if (response) {
        const source = (await response.text()).replaceAll("\\", "/").toLowerCase();
        const expected = renderingRoot.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
        if (
            !response.ok ||
            (!source.includes(expected) && !source.includes(encodeURI(expected))) ||
            !source.includes("createearthruntime")
        ) {
            throw new Error(`Port 5189 does not serve this Babylon Earth checkout: ${sampleRoot}`);
        }
        console.log(`Reusing ${sampleUrl}`);
        printSources();
        return { baseUrl: sampleUrl, close: async () => {} };
    }
    const server = await createServer({
        configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
        root: sampleRoot,
        server: { host: "127.0.0.1", port: 5189, strictPort: true, open: false },
    });
    try {
        await server.listen();
    } catch (error) {
        await server.close();
        throw error;
    }
    console.log(`Serving ${sampleUrl}`);
    printSources();
    return { baseUrl: sampleUrl, close: () => server.close() };
}

function printSources() {
    console.log(`Babylon Earth sources: ${sampleRoot}`);
    console.log(`Atmosphere sources: ${atmosphereRoot}`);
}
