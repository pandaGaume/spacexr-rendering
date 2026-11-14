# Use the framework in another application

Keep the application next to `spacexr-tiling`, `3d-tiles-core`, `terrain-core` and `spacexr-rendering`. Build the framework once from `spacexr-rendering` with `npm run framework:build`. The current reference examples are the fastest working starting point; copy application code into your own project and keep the framework packages linked.

## Local dependencies

Use this dependency block in the sibling application's package.json. The Babylon version below is the version actually installed for the qualified framework, not a new dependency upgrade.

```json
{
  "dependencies": {
    "@babylonjs/core": "9.33.1",
    "@babylonjs/loaders": "9.33.1",
    "@spacexr/geodesy": "0.4.0",
    "@spacexr/3d-tiles-core": "file:../3d-tiles-core/node/packages/core",
    "@spacexr/tiles": "file:../spacexr-tiling/packages/tiles",
    "@spacexr/3d-tiles-runtime": "file:../3d-tiles-core/node/packages/runtime",
    "@spacexr/raster": "file:../terrain-core/packages/raster",
    "@spacexr/terrain-tileset": "file:../terrain-core/packages/terrain-tileset",
    "@spacexr/dem": "file:../terrain-core/packages/dem",
    "@spacexr/grid": "file:../terrain-core/packages/grid",
    "@spacexr/3d-tiles-babylon": "file:../spacexr-rendering/packages/core"
  }
}
```

Add `install-links=false` to the application's `.npmrc`, then run `npm install`. This links the canonical packages instead of installing stale copies. No global `npm link` is required. The package names and imports remain those used before recomposition.

For a Vite application, follow the reference examples' `preserveSymlinks`, Babylon deduplication where needed, and exclusion of the linked SpaceXR packages from dependency prebundling. Use public package imports in application code. An alias to `packages/core/src/index.ts` is useful for framework development but is not required for a build-based consumer.

## Current functionality

Use [the Babylon adapter API](../packages/core/README.md), [the 3D Tiles example](../examples/babylon-google-3d-tiles/README.md) and [the terrain example](../examples/babylon-implicit-grid-mapzen/README.md). The runtime, data loading, terrain CPU/GPU engines and shaders remain the existing implementations. glTF applications explicitly import the Babylon loader registration, as before.

The first qualified terrain reference is Web Mercator. Cube rendering is deferred. New ridge reconstruction, oriented cliffs, Spatial Awareness, Three integration and new MCP behaviors are subsequent work. Provider credentials, attribution and external dataset availability remain the application's responsibility.

## After changing a framework package

Rebuild with `npm run framework:build` from `spacexr-rendering`, or run the appropriate watch task in `SpaceXR-Framework.code-workspace` after an initial build. Restart a consumer's Vite process if it retained dependency caches from old paths. Use `npm run framework:verify` to check the framework's canonical links.

## Updated configuration contract

Obtain an ellipsoid from `spacexr-celestial` in your application composition, construct its `GeodeticSystem`, and pass it to camera, metrics and spatial metric factories. Pass the corresponding `webMercatorTiling(system)` to terrain engines. Supply metrics explicitly to `createGeodesicGridSource`. Mapzen factories are demo code, not generic package exports. The optional `@spacexr/babylon-earth` facade now encapsulates this Earth assembly with the existing spectral WebGPU sky backend.

## Optional Earth composition

Add the following local dependencies alongside the generic framework dependencies listed above, using paths relative to your application:

```json
{
  "@spacexr/babylon-earth": "file:../spacexr-rendering/packages/babylon-earth",
  "@spacexr/celestial-core": "file:../celestial-core",
  "@spacexr/atmosphere": "file:../atmosphere-core"
}
```

Celestial currently depends on the sibling Quantia package. Build those physical packages before Earth, or use the updated `framework:install` and `framework:build` scripts, which handle that order. Keep `install-links=false` and one Babylon installation in the application. This is a local delivery, not a registry release. The Earth library uses Babylon 9.33.x for its isolated WebGPU bridge. See [integration code](../packages/babylon-earth/README.md) and [the two examples](../examples/babylon-earth/README.md).
