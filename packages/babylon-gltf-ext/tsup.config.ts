import { defineConfig } from "tsup";

export default defineConfig({
    // The loaders and the exporters are separate entries: an application that only reads glTF does not need the
    // serializers of Babylon.js, and one that only writes it does not need its loaders.
    entry: { index: "src/index.ts", loader: "src/loader.ts", exporter: "src/exporter.ts" },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: [/^@babylonjs\//],
});
