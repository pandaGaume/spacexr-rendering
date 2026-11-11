import { defineConfig } from "tsup";

export default defineConfig({
    // The loaders of the glTF feature metadata are an entry of their own: they import the glTF loader of Babylon.js,
    // an optional peer that an application without glTF content does not install.
    entry: { index: "src/index.ts", "gltf-features": "src/gltf/features/loaders.ts" },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: [/^@babylonjs\//, "@spacexr/3d-tiles-core", "@spacexr/3d-tiles-runtime", "@spacexr/geodesy"],
});
