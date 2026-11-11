# Earth: orbital and inside-atmosphere examples

From spacexr-rendering, run `npm run framework:install`, `npm run framework:build`, then `npm run example:earth`. This starts the local Vite server on port 5189 and opens the orbital-horizon and daytime-atmosphere pages in the default browser. An existing server is reused only if it serves this checkout. Both `orbital.html` and `atmosphere.html` use the public `@spacexr/babylon-earth` composition and the existing terrain, raster and 3D Tiles components.

## Existing tile sources

Both entries use `createMapzenTerrariumSource`, `DemPyramid`, `ChildHeightRanges`, the existing DEM workers and `TERRAIN_CONFIG` from the working Mapzen example. The same TileRuntime instance selects terrain and imagery residency in the Earth composition. There is no manual global-image reprojection and no extra imagery runtime.

Imagery uses `loadLocalImagery` from `babylon-implicit-grid-mapzen`, with the existing configured local provider selected by `?imagery=google` by default. That provider already uses `WebTileSource`, `WebMercatorTileMetrics` and `BrowserImageDecoder`. Its decoded tiles feed the existing `BabylonRasterPages` and stitched `RasterPyramid`. The local provider module stays in the original sample's ignored `src/local/` directory; it is not copied or published by babylon-earth. On another machine, configure that existing local provider module as documented by the Mapzen sample, or use `?imagery=none`. The reusable Earth library receives imagery through `terrain.imagery` and has no hardcoded provider.

`?dem=0` explicitly disables DEM loading. `?imagery=none` explicitly disables imagery. Network access is required for the configured sources. Attribution follows the provider and Mapzen/AWS source.

## Views and controls

- `/orbital.html` opens the whole Earth.
- `/orbital.html?view=horizon&sse=20` opens a grazing orbital view.
- `/orbital.html?view=horizon&sunset=1&sse=20` computes a geometric orbital sunset using Celestial.
- `/atmosphere.html?hour=10&sse=20` reproduces the daytime terrain view at 10:00 UTC.
- `/atmosphere.html?sunset=1&sse=20` opens the Mapzen sunset view.

Drag to navigate and use the wheel to zoom. The UTC slider changes Celestial sunlight; the checkbox compares atmosphere on the same scene. Exposure defaults to 4, consistently at startup and after date changes. The fixed demonstration date is 2026-06-21. `hour` accepts values from 0 to 24.

SSE defaults to 20 pixels and remains configurable with `?sse=24`. The sample uses one render pixel per CSS pixel by default; `?dpr=1.5` or `?dpr=2` opts into higher resolution, and `?dpr=0.75` reduces it.

## Atmospheric composition

The existing WebGPU terrain fragment shader applies atmospheric transport at the projected position of each displaced surface fragment, without a scene HDR target or camera post-process. The existing atmospheric volume uses a continuous distance coordinate across the reference ellipsoid's horizon. Ground intersections stop transport without rescaling neighboring rays. This prevents a horizontal atmospheric cut through foreground mountains. The backend owns spectral transport; the native terrain shader reconstructs distance and samples its result. The camera-volume change does not alter tile selection or add a terrain renderer.

Earth includes a documented reference ozone column and an isotropic higher-order scattering approximation. See [the library contract](../../packages/babylon-earth/README.md) for limitations, resource ownership and integration into another application. The WebGL terrain variant is `/orbital.html?renderer=webgl&atmosphere=0`.

The top-right HUD always shows FPS and an Atmosphere checkbox. OFF restores the original terrain material and stops atmospheric work, allowing a comparison on the same camera and scene. No atmospheric HDR or FXAA pass is attached to the camera.

## Browser validation

Run from the `spacexr-rendering` root. Each command starts the sample if needed, or verifies and reuses its server on port 5189. Results stay in this repository under `.cache/babylon-earth/`.

- `npm run test:earth:motion`: five seconds of real RAF orbital rotation with atmosphere absent at creation, OFF, ON and return OFF, plus CPU timings.
- `npm run test:earth:views`: real rotation and translation in the daytime, sunset and orbital views.
- `npm run test:earth:gpu`: real-motion GPU stage profiling with captured WebGPU validation errors.
- `npm run test:earth:visual`: screenshots of all three views after the real Mapzen tiles finish loading, plus cached orbiter/terrain round trips. Every displayed tile must keep resident imagery and a valid GPU drape binding.
- `npm run test:earth:native`: native material restoration, OFF/ON, date replacement and shared camera/runtime checks.

The scripts live in `examples/babylon-earth/scripts/browser`. They reuse Chrome and the existing Playwright installation from the sibling atmosphere package's scientific toolchain. `npm run framework:install` installs that existing toolchain; no additional dependency is introduced here. There is no dependency on the legacy repository or a user-specific filesystem path. A browser test closes only the server it started. Local provider configuration is still required for the real Mapzen/imagery checks.

`npm run dev --workspace @spacexr/example-babylon-earth` retains the existing Vite development command without automatic browser opening.
