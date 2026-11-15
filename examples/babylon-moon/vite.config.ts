import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
    resolve: {
        preserveSymlinks: true,
        dedupe: ["@babylonjs/core", "@spacexr/geodesy"],
        alias: {
            "@spacexr/babylon-moon": fileURLToPath(new URL("../../packages/babylon-moon/src/index.ts", import.meta.url)),
            "@spacexr/3d-tiles-babylon": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
        },
    },
    server: {
        port: 5176,
        strictPort: true,
        open: false,
        // Reload the packages linked from sibling repositories when they are rebuilt.
        watch: { ignored: ["!**/node_modules/@spacexr/**"] },
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
            "@spacexr/3d-tiles-runtime",
            "@spacexr/terrain-tileset",
            "@spacexr/babylon-moon",
            "@spacexr/3d-tiles-babylon",
        ],
    },
    build: { target: "es2022", sourcemap: true },
});
