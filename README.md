# SpaceXR Rendering

| View                                                                                                                                                                                                                                                           | Full URL                                                                                                                                                                                                                               | QR code                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Open Jezero HD terrain](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)  | `http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2`  | [![QR code for Open Jezero HD terrain](examples/babylon-mars/docs/qr-codes/jezero-hd.png)](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)  |
| [Open Utopia HD terrain](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) | `http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2` | [![QR code for Open Utopia HD terrain](examples/babylon-mars/docs/qr-codes/utopia-hd.png)](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) |
| [Open Shackleton HD terrain](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)     | `http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2`         | [![QR code for Open Shackleton HD terrain](examples/babylon-moon/docs/qr-codes/shackleton-hd.png)](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) |

The QR codes encode these exact `localhost` URLs. On another device, `localhost` points to that device; a phone needs a reachable address for the computer serving the example.

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

`npm run framework:check` runs the formatting, lint, type checks, tests and package builds of each repository in dependency order. In this repository, `npm run check` builds the packages, then formats, lints, type checks and tests every workspace, examples included; `npm run build:examples` builds the production bundles of the examples, which the CI builds beside the check, one example per runner. Google content still requires its existing demonstration credentials.

Open [SpaceXR-Framework.code-workspace](SpaceXR-Framework.code-workspace) for library work, or [SpaceXR-Applications.code-workspace](SpaceXR-Applications.code-workspace) to include the reference demonstrations. Task folder names are stable and paths are relative.

The Babylon adapter remains together in `packages/core` for this first phase. Splitting terrain, atmosphere, generic kernels, Three integration or MCP packages is deferred until the working framework has been qualified. See [migration](docs/framework-migration.md), [terrain pipeline](docs/terrain-pipeline.md), [terrain settings](docs/terrain-settings.md) and [renderer evaluation](docs/renderer-evaluation.md).

## Launch examples

After the framework setup, run a shortcut from `spacexr-rendering`:

| Example          | Command                           |
| ---------------- | --------------------------------- |
| Earth            | `npm run example:earth`           |
| Moon             | `npm run example:moon`            |
| Mars             | `npm run example:mars`            |
| Implicit terrain | `npm run example:implicit-grid`   |
| Google 3D Tiles  | `npm run example:google-3d-tiles` |
| Draped vectors   | `npm run example:vectors`         |

Mars and Moon open in the browser and load their published R2 elevation and imagery without URL parameters. Use `?dataset=<folder of another revision>` to override the default. See the [Mars sample](examples/babylon-mars/README.md) and [Moon sample](examples/babylon-moon/README.md) for the dataset addresses and camera options. Google 3D Tiles requires its existing API key configuration.

### Published Mars and Moon datasets

`dataset` is optional in both examples. Their pinned R2 defaults include elevation and imagery:

| Body | Default `dataset` folder                                                                                                                                                                                           | Content                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Moon | [https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f) | Elevation and lunar imagery           |
| Mars | [https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c) | Elevation and Tianwen-1 MoRIC imagery |

Each folder contains `elevation.json` and `imagery.json`. The examples use these direct revision URLs, independently of `cube/mars/catalog/latest-global.json` and `cube/catalog.json`. Pass `?dataset=<revision-folder-url>` to choose another revision. The [Mars guide](examples/babylon-mars/README.md) records the 2026-11-15 publication status and the pending catalog switch.

### Direct HD terrain views

With the local servers running, use the launch table at the beginning of this README. Each URL includes the dataset, target coordinates and camera settings. The terrain sources are HiRISE DTM at 1 m for Jezero, HiRIC DEM at 3.5 m for Utopia, and LOLA / PGDA 81 DEM at 5 m for Shackleton.

The presets use `radius=8000`, `pitch=70`, `grid=64` and `sse=2`. HD refers to the terrain; Mars uses the global MoRIC imagery from a 76 m/pixel source, and Moon uses global lunar imagery. The [Mars](examples/babylon-mars/README.md) and [Moon](examples/babylon-moon/README.md) guides list every URL parameter, its default and its units.

## First delivery scope

The validated reference is the current 3D Tiles and Web Mercator terrain framework. Cube modules and lunar tools have been removed from the active framework. Body data and provider configuration belong to samples or optional body-specific compositions.

Read [validation and known consumer limitations](docs/validation.md). The full adapter API and its usage examples remain in [the package guide](packages/core/README.md).

For another development project, use [the local consumer guide](docs/consume-framework.md).

The generic libraries require explicit physical and geodetic inputs. Provider presets are confined to samples. The cube and lunar tools are outside this delivery. See the [layering and planned Earth integration](../spacexr-rendering/docs/architecture.md).

## Optional Earth runtime and two examples

`@spacexr/babylon-earth` composes Celestial and the existing TileRuntime, with the Sun as a directional light; there is no atmosphere for now. Run `npm run example:earth` to start the sample on port 5189 and open `/orbital.html?view=horizon&sse=20` and `/orbital.html?view=terrain&hour=10&sse=20`. See [the sample](examples/babylon-earth/README.md) and [the reusable library](packages/babylon-earth/README.md). The framework scripts also install and build the Quantia and Celestial dependencies.

## Draped vectors

Run `npm run example:vectors` and open http://127.0.0.1:5191/. [The sample](examples/babylon-vector-terrain/README.md) uses the migrated `@spacexr/vector` package, precalculated transparent RGBA tiles, Mapzen terrain and the single existing Earth TileRuntime. No atmosphere or extra rendering pass.
