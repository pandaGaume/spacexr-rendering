import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
    resolve: {
        preserveSymlinks: true,
        dedupe: ["@babylonjs/core", "@spacexr/geodesy"],
        alias: {
            "@spacexr/vector/browser": fileURLToPath(new URL("../../../terrain-core/packages/vector/src/browser.ts", import.meta.url)),
            "@spacexr/vector": fileURLToPath(new URL("../../../terrain-core/packages/vector/src/index.ts", import.meta.url)),
            "@spacexr/babylon-earth": fileURLToPath(new URL("../../packages/babylon-earth/src/index.ts", import.meta.url)),
            "@spacexr/3d-tiles-babylon": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
        },
    },
    server: { host: "127.0.0.1", port: 5191, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
    esbuild: { target: "es2022" },
    optimizeDeps: {
        esbuildOptions: { target: "es2022" },
        exclude: [
            "@spacexr/vector",
            "@spacexr/3d-tiles-babylon",
            "@spacexr/babylon-earth",
            "@spacexr/tiles",
            "@spacexr/raster",
            "@spacexr/dem",
            "@spacexr/grid",
            "@spacexr/3d-tiles-runtime",
            "@spacexr/atmosphere",
        ],
    },
    build: { target: "es2022", sourcemap: true },
});
