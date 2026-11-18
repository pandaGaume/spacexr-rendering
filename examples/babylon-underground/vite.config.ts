import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
    resolve: {
        preserveSymlinks: true,
        dedupe: ["@babylonjs/core"],
        alias: {
            "@spacexr/babylon-underground": fileURLToPath(new URL("../../packages/babylon-underground/src/index.ts", import.meta.url)),
        },
    },
    server: {
        host: "127.0.0.1",
        port: 5193,
        strictPort: true,
        open: false,
        fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    },
    esbuild: { target: "es2022" },
    optimizeDeps: {
        esbuildOptions: { target: "es2022" },
        exclude: ["@spacexr/babylon-underground"],
    },
    build: { target: "es2022", sourcemap: true },
});
