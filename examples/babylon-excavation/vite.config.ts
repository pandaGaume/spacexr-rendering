import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import { exampleConfig } from "../../../spatial-display/examples/vite.base";

const PORT = 5195;
const here = (path: string): string =>
    fileURLToPath(new URL(path, import.meta.url));

/**
 * With `--mode headset` the page is served as the examples of spatial-display are (its `examples/vite.base.ts`): to
 * the whole network and over https, with the certificate the developer made in `spatial-display/examples/.cert`, and
 * what the page tells of the headset is written to this terminal.
 */
export default defineConfig((env) =>
    mergeConfig(
        {
            resolve: {
                preserveSymlinks: true,
                // One Babylon.js for the page and for the helper of spatial-display it imports.
                dedupe: ["@babylonjs/core"],
                alias: {
                    "@spacexr/babylon-underground": here(
                        "../../packages/babylon-underground/src/index.ts",
                    ),
                },
            },
            server: {
                host: "127.0.0.1",
                open: false,
                fs: {
                    allow: [
                        here("../.."),
                        here("../../../spatial-display/examples"),
                    ],
                },
            },
            esbuild: { target: "es2022" },
            optimizeDeps: {
                esbuildOptions: { target: "es2022" },
                exclude: ["@spacexr/babylon-underground"],
            },
            build: { target: "es2022", sourcemap: true },
        },
        exampleConfig(PORT)(env),
    ),
);
