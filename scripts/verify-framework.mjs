import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const owners = {
    "@spacexr/3d-tiles-core": "../3d-tiles-core/node/packages/core",
    "@spacexr/tiles": "../spacexr-tiling/packages/tiles",
    "@spacexr/3d-tiles-runtime": "../3d-tiles-core/node/packages/runtime",
    "@spacexr/raster": "../terrain-core/packages/raster",
    "@spacexr/dem": "../terrain-core/packages/dem",
    "@spacexr/grid": "../terrain-core/packages/grid",
    "@spacexr/vector": "../terrain-core/packages/vector",
    "@spacexr/terrain-tileset": "../terrain-core/packages/terrain-tileset",
    "@spacexr/3d-tiles-babylon": "packages/core",
    "@spacexr/babylon-earth": "packages/babylon-earth",
    "@spacexr/celestial-core": "../celestial-core",
    "@spacexr/atmosphere": "../atmosphere-core",
};
const scopes = [
    resolve(root, "examples/babylon-vector-terrain"),
    resolve(root, "packages/babylon-earth"),
    resolve(root, "examples/babylon-earth"),
    root,
    resolve(root, "packages/core"),
    resolve(root, "examples/babylon-implicit-grid-mapzen"),
    resolve(root, "examples/babylon-google-3d-tiles"),
];
for (const scope of scopes) {
    for (const [name, relative] of Object.entries(owners)) {
        const actual = realpathSync(
            dirname(
                fileURLToPath(
                    import.meta.resolve(
                        name,
                        pathToFileURL(resolve(scope, "package.json")).href,
                    ),
                ),
            ),
        );
        const expected = realpathSync(resolve(root, relative, "dist"));
        if (actual.toLowerCase() !== expected.toLowerCase())
            throw new Error(
                `${scope}: ${name} resolves to ${actual}, expected ${expected}`,
            );
    }
    console.log(`Canonical package links: ${scope}`);
}
for (const [name, relative] of Object.entries(owners)) {
    const path = resolve(root, relative);
    const pkg = JSON.parse(readFileSync(resolve(path, "package.json"), "utf8"));
    if (pkg.name !== name) throw new Error(`Package identity changed: ${name}`);
}
console.log("All package identities and canonical links verified.");
