# Mars example

| View                                                                                                                                                                                                                                                           | Full URL                                                                                                                                                                                                                               | QR code                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Open Jezero HD terrain](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)  | `http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2`  | [![QR code for Open Jezero HD terrain](docs/qr-codes/jezero-hd.png)](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=18.488057&lon=77.403449&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2)  |
| [Open Utopia HD terrain](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) | `http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2` | [![QR code for Open Utopia HD terrain](docs/qr-codes/utopia-hd.png)](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c&lat=24.746853&lon=110.318004&radius=8000&pitch=70&yaw=0&scale=1&imagery=dataset&grid=64&sse=2) |

The QR codes encode these exact `localhost` URLs. On another device, `localhost` points to that device; a phone needs a reachable address for the computer serving the example.

## Start

From `spacexr-rendering`, run:

```sh
npm run example:mars
```

The command opens [http://localhost:5177/](http://localhost:5177/). It uses `@spacexr/babylon-mars` and loads the published R2 revision without URL parameters. The default camera targets Jezero crater. Drag to pan, right-drag to turn and tilt, and use the wheel to zoom.

## Published R2 dataset

Public host: [https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev). The default revision includes elevation and global Tianwen-1 MoRIC colour imagery:

```text
https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c
```

`dataset` names the folder of a revision, not a descriptor or tile file. The loader reads [elevation.json](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c/elevation.json) and, when published, [imagery.json](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c/imagery.json) from this folder. Relative tile templates resolve against their descriptor URL.

The parameter is optional in this example. To select a different revision, pass `?dataset=<revision-folder-url>`. This [explicit default-dataset link](http://localhost:5177/?dataset=https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c) is equivalent to opening the example without parameters.

Publication note, 2026-11-15: revision `0baf76880ef90d80ea3c` contains 538,694 files on R2, matching the local revision. During the final rclone verification, `cube/mars/catalog/latest-global.json` and `cube/catalog.json` still advertised the older `41ff3b32bce19c1eb4aa` revision, which contains elevation only. The catalog pointers are switched after rclone's final pass. This example uses the direct revision URL above and does not depend on that switch.

## HD terrain views

The launch table at the beginning of this README includes complete URLs and QR codes targeting the high-resolution DEM coverage. Jezero uses the HiRISE DTM at 1 m source resolution, cube LOD 11 to 14. Utopia Planitia, the Chinese Tianwen-1 / Zhurong region, uses the HiRIC DEM at 3.5 m source resolution, cube LOD 5 to 12.

Both presets use `radius=8000`, `pitch=70`, `yaw=0`, `scale=1`, `imagery=dataset`, `grid=64` and `sse=2`. They target the centres of the source footprints. Jezero's HiRISE coverage is approximately 18.306799 to 18.669315 degrees north and 77.222933 to 77.583964 degrees east; Utopia's HiRIC coverage is approximately 23.489031 to 26.004674 degrees north and 109.811882 to 110.824127 degrees east.

HD here refers to the relief. The imagery of this revision is the global MoRIC mosaic, from a 76 m/pixel source, down to cube LOD 8. The links do not enable regional HiRISE or HiRIC imagery that this revision does not publish. Dataset provenance is recorded in the [revision manifest](https://pub-d96348c50a354038a1df6f85e91e45c9.r2.dev/cube/mars/datasets/mars/global-0baf76880ef90d80ea3c/manifest.json).

## URL parameters

| Parameter       | Values / units                                                | Default                                    | Effect                                                                                       |
| --------------- | ------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `dataset`       | Revision folder URL                                           | Published R2 revision above, optional      | Reads `elevation.json` and, when available, `imagery.json`.                                  |
| `lat`, `lon`    | Planetocentric degrees, east-positive longitude               | `18.4`, `77.6`                             | Point the camera orbits.                                                                     |
| `radius`        | Metres                                                        | `90000`                                    | Distance from the camera to the orbited point.                                               |
| `pitch`         | Degrees                                                       | `60`                                       | Camera inclination.                                                                          |
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

The defaults for `grid`, `sse`, `demCache` and `demAbortDelay` come from [terrain-config.json](../../packages/core/src/terrain/terrain-config.json). Camera limits come from [mars-config.json](../../packages/babylon-mars/src/mars-config.json): `radiusMin=10` m and `altitudeMin=1.5` m. The URL camera distances remain subject to those limits.
