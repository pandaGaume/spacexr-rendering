# SpaceXR Rendering

The working Babylon 3D Tiles and terrain framework, recomposed into its new repository while preserving package names and algorithms.

| Repository          | Packages                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| `spacexr-tiling`    | `@spacexr/tiles`                                                              |
| `3d-tiles-core`     | `@spacexr/3d-tiles-core`, `@spacexr/3d-tiles-runtime`                         |
| `terrain-core`      | `@spacexr/raster`, `@spacexr/dem`, `@spacexr/grid`                            |
| `spacexr-rendering` | `@spacexr/3d-tiles-babylon`, private shader/benchmark tools and both examples |

## Start developing

All three repositories must be siblings. Node.js 22 is recommended for the existing browser benchmark tools; packages retain their current minimum engines.

```sh
npm run framework:install
npm run framework:build
npm run framework:verify
npm run example:implicit-grid
```

`npm run framework:check` runs the existing formatting, lint, type checks, tests and builds in dependency order, including both reference examples. Google content still requires its existing demonstration credentials.

Open [SpaceXR-Framework.code-workspace](SpaceXR-Framework.code-workspace) for library work, or [SpaceXR-Applications.code-workspace](SpaceXR-Applications.code-workspace) to include the reference demonstrations. Task folder names are stable and paths are relative.

The Babylon adapter remains together in `packages/core` for this first phase. Splitting terrain, atmosphere, generic kernels, Three integration or MCP packages is deferred until the working framework has been qualified. See [migration](docs/framework-migration.md), [terrain pipeline](docs/terrain-pipeline.md), [terrain settings](docs/terrain-settings.md) and [renderer evaluation](docs/renderer-evaluation.md).

## First delivery scope

The validated reference is the current 3D Tiles and Web Mercator terrain framework. Cube modules and lunar tools have been removed from the active framework. Body data and provider configuration belong to samples or optional body-specific compositions.

Read [validation and known consumer limitations](docs/validation.md). The full adapter API and its usage examples remain in [the package guide](packages/core/README.md).

For another development project, use [the local consumer guide](docs/consume-framework.md).

The generic libraries require explicit physical and geodetic inputs. Provider presets are confined to samples. The cube and lunar tools are outside this delivery. See the [layering and planned Earth integration](../spacexr-rendering/docs/architecture.md).

## Optional Earth runtime and two examples

`@spacexr/babylon-earth` composes Celestial, the existing TileRuntime and the public spectral AtmosphereSky backend. Its Babylon atmosphere bridge remains internal. Run `npm run example:earth` to start the sample on port 5189 and automatically open both `/orbital.html?view=horizon&sse=20` and `/atmosphere.html?hour=10&sse=20`. Browser checks are attached to this workspace through `npm run test:earth:motion`, `test:earth:views`, `test:earth:gpu`, `test:earth:visual` and `test:earth:native`. See [the sample](examples/babylon-earth/README.md) and [the reusable library](packages/babylon-earth/README.md). Atmospheric rendering requires WebGPU; explicit WebGL terrain-only mode remains available. The framework scripts now also install/build Quantia, Celestial and Atmosphere dependencies.

## Draped vectors

Run `npm run example:vectors` and open http://127.0.0.1:5191/. [The sample](examples/babylon-vector-terrain/README.md) uses the migrated `@spacexr/vector` package, precalculated transparent RGBA tiles, Mapzen terrain and the single existing Earth TileRuntime. No atmosphere or extra rendering pass.
