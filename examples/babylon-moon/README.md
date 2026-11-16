# Moon example

| View                                                                                                                                                                                                                                                          | Full URL                                                                                                                                                                                                                        | QR code                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Open Shackleton HD terrain](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)    | `http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2`  | [![QR code for Open Shackleton HD terrain](docs/qr-codes/shackleton-hd.png)](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)      |
| [Open a wider Shackleton view](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=20000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) | `http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=20000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2` | [![QR code for Open a wider Shackleton view](docs/qr-codes/shackleton-wide.png)](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f&lat=-89.67&lon=129.2&radius=20000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) |

The QR codes encode these exact `localhost` URLs. On another device, `localhost` points to that device; a phone needs a reachable address for the computer serving the example.

## Start

From `spacexr-rendering`, run:

```sh
npm run example:moon
```

The command opens [http://localhost:5176/](http://localhost:5176/). It uses `@spacexr/babylon-moon` and loads the published R2 revision without URL parameters. The default camera targets Shackleton crater near the south pole. Drag to pan, right-drag to turn and tilt, and use the wheel to zoom.

## Published R2 dataset

Public host: [https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev). The default revision includes elevation and global lunar imagery:

```text
https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f
```

`dataset` names the folder of a revision, not a descriptor or tile file. The loader reads [elevation.json](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f/elevation.json) and, when published, [imagery.json](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f/imagery.json) from this folder. Relative tile templates resolve against their descriptor URL.

The parameter is optional in this example. To select a different revision, pass `?dataset=<revision-folder-url>`. This [explicit default-dataset link](http://localhost:5176/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f) is equivalent to opening the example without parameters.

## Shackleton HD terrain

The launch table at the beginning of this README includes the close and wider Shackleton views, with their complete URLs and QR codes. Both target latitude `-89.67`, longitude `129.2`, on the adjusted LOLA / PGDA 81 DEM at 5 m source resolution, cube LOD 7 to 11.

These complete URLs include the R2 dataset and use `pitch=70`, `yaw=0`, `scale=1`, `imagery=dataset`, `grid=64` and `sse=2`. The close view uses `radius=8000`; the wider view uses `radius=20000`. The target retains the example's Shackleton coordinates, near the location documented by [NASA](https://moon.nasa.gov/resources/162/on-the-rim/).

The published polar DEM covers the cap south of 87 degrees south, with the full 5 m source refinement south of 87.25 degrees south. HD refers to the relief; the imagery remains the global lunar mosaic. See the [polar refinement metadata](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f/shackleton.json) and [revision manifest](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/moon/datasets/moon/global-99bcf7766dc093ba0f2f/manifest.json).

## URL parameters

| Parameter       | Values / units                                                | Default                                    | Effect                                                                                       |
| --------------- | ------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `dataset`       | Revision folder URL                                           | Published R2 revision above, optional      | Reads `elevation.json` and, when available, `imagery.json`.                                  |
| `lat`, `lon`    | Planetocentric degrees, east-positive longitude               | `-89.67`, `129.2`                          | Point the camera orbits.                                                                     |
| `radius`        | Metres                                                        | `30000`                                    | Distance from the camera to the orbited point.                                               |
| `pitch`         | Degrees                                                       | `55`                                       | Camera inclination.                                                                          |
| `yaw`           | Degrees                                                       | `0`                                        | Camera heading.                                                                              |
| `scale`         | Number                                                        | `1`                                        | Vertical exaggeration, also controlled by the altitude slider.                               |
| `imagery`       | `dataset`, `debug`, `none`                                    | `dataset` when published, otherwise `none` | Dataset imagery, a local checkerboard coloured by level, or relief alone.                    |
| `elevation`     | `0` to disable                                                | Enabled                                    | `0` renders the dataset reference surface without relief.                                    |
| `solid`         | `0` to disable                                                | Enabled                                    | `0` renders wireframe without imagery.                                                       |
| `lighting`      | `ambient`, `terrain`                                          | `terrain`                                  | Uniform ambient lighting or lighting of the relief.                                          |
| `renderer`      | `webgpu`, `webgl`                                             | `webgl`                                    | `webgpu` uses the WebGPU engine and WGSL shaders on supported browsers.                      |
| `antialias`     | `0` to disable                                                | Enabled                                    | `0` disables antialiasing.                                                                   |
| `grid`          | Cells per tile side: `4`, `8`, `16`, `32`, `64`, `128`, `256` | `64`                                       | Terrain grid resolution.                                                                     |
| `sse`           | Pixels                                                        | `10`                                       | Tolerated screen-space error; lower values select finer terrain.                             |
| `motion`        | `0` to disable                                                | Enabled                                    | `0` disables the reduction in refinement while the camera moves.                             |
| `demCache`      | Entries                                                       | `2048`                                     | Elevation tile cache size.                                                                   |
| `demAbortDelay` | Milliseconds                                                  | `500`                                      | Delay before cancelling an elevation load that is no longer needed.                          |
| `monitor`       | `0` to disable                                                | Enabled                                    | `0` disables runtime monitoring and clears the statistics.                                   |
| `hud`           | `0` to disable                                                | Enabled                                    | `0` hides the scale, compass and view readouts (`Alt`, `Ref`, `Gnd`, `Hdg`, `Pitch`, `Pos`). |

`imagery=dataset` requires a revision that publishes `imagery.json`. Append `&renderer=webgpu` to a preset to use WebGPU, or `&scale=2` to exaggerate the relief.

The defaults for `grid`, `sse`, `demCache` and `demAbortDelay` come from [terrain-config.json](../../packages/core/src/terrain/terrain-config.json). Camera limits come from [moon-config.json](../../packages/babylon-moon/src/moon-config.json): `radiusMin=10` m and `altitudeMin=1.5` m. The URL camera distances remain subject to those limits.

The terrain bench selects a revision explicitly with `--dataset`: see the [tools guide](../../packages/tools/README.md).
