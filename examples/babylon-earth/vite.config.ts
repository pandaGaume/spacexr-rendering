import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
    resolve: {
        preserveSymlinks: true,
        dedupe: ["@babylonjs/core", "@spacexr/geodesy"],
        alias: {
            "@spacexr/ocean": fileURLToPath(new URL("../../../ocean-core/src/index.ts", import.meta.url)),
            "@spacexr/atmosphere/webgpu": fileURLToPath(new URL("../../../atmosphere-core/webgpu/index.ts", import.meta.url)),
            "@spacexr/atmosphere": fileURLToPath(new URL("../../../atmosphere-core/src/index.ts", import.meta.url)),
            "@spacexr/babylon-earth": fileURLToPath(new URL("../../packages/babylon-earth/src/index.ts", import.meta.url)),
            "@spacexr/3d-tiles-babylon": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
        },
    },
    server: {
        port: 5180,
        host: "127.0.0.1",
        open: false,
        fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] },
    },
    esbuild: { target: "es2022" },
    optimizeDeps: {
        esbuildOptions: { target: "es2022" },
        exclude: [
            "@spacexr/dem",
            "@spacexr/raster",
            "@spacexr/tiles",
            "@spacexr/3d-tiles-core",
            "@spacexr/grid",
            "@spacexr/babylon-earth",
            "@spacexr/3d-tiles-babylon",
            "@spacexr/3d-tiles-runtime",
            "@spacexr/atmosphere",
            "@spacexr/celestial-core",
        ],
    },
    build: {
        target: "es2022",
        sourcemap: true,
        rollupOptions: {
            input: {
                index: fileURLToPath(new URL("index.html", import.meta.url)),
                orbital: fileURLToPath(new URL("orbital.html", import.meta.url)),
                atmosphere: fileURLToPath(new URL("atmosphere.html", import.meta.url)),
            },
        },
    },
});
