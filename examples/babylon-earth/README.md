# Earth: orbital and terrain examples

From spacexr-rendering, run `npm run framework:install`, `npm run framework:build`, then `npm run example:earth`. This starts the local Vite server on port 5189 and opens the orbital-horizon and daytime terrain pages in the default browser. An existing server is reused only if it serves this checkout. `index.html` and `orbital.html` use the public `@spacexr/babylon-earth` composition and the existing terrain, raster and 3D Tiles components.

## Existing tile sources

Both entries use `createMapzenTerrariumSource`, `DemPyramid`, `ChildHeightRanges`, the existing DEM workers and `TERRAIN_CONFIG` from the working Mapzen example. The same TileRuntime instance selects terrain and imagery residency in the Earth composition. There is no manual global-image reprojection and no extra imagery runtime.

Imagery uses `loadLocalImagery` from `babylon-implicit-grid-mapzen`, with the existing configured local provider selected by `?imagery=google` by default. That provider already uses `WebTileSource`, `WebMercatorTileMetrics` and `BrowserImageDecoder`. Its decoded tiles feed the existing `BabylonRasterPages` and stitched `RasterPyramid`. The local provider module stays in the original sample's ignored `src/local/` directory; it is not copied or published by babylon-earth. On another machine, configure that existing local provider module as documented by the Mapzen sample, or use `?imagery=none`. The reusable Earth library receives imagery through `terrain.imagery` and has no hardcoded provider.

`?dem=0` explicitly disables DEM loading. `?imagery=none` explicitly disables imagery. Network access is required for the configured sources. Attribution follows the provider and Mapzen/AWS source.

## Views and controls

- `/orbital.html` opens the whole Earth.
- `/orbital.html?view=horizon&sse=20` opens a grazing orbital view.
- `/orbital.html?view=horizon&sunset=1&sse=20` computes a geometric orbital sunset using Celestial.
- `/orbital.html?view=terrain&hour=10&sse=20` opens the daytime terrain view at 10:00 UTC.
- `/orbital.html?view=terrain&sunset=1&sse=20` opens the Mapzen sunset view.

Any view can start elsewhere. `lat` and `lon`, in degrees, give the point the camera aims at, and `height`, in metres, its height (0 by default). `radius` is the distance from the camera to that point in metres, `pitch` the tilt from the vertical and `yaw` the heading from north, both in degrees. A parameter left out keeps the value of the view. For example, `/orbital.html?view=terrain&lat=62.8665&lon=29.9975&radius=6000&pitch=65` opens the terrain view over Koli, in Finland.

Drag to navigate and use the wheel to zoom. The UTC slider changes Celestial sunlight. The fixed demonstration date is 2026-06-21. `hour` accepts values from 0 to 24.

SSE defaults to 20 pixels and remains configurable with `?sse=24`. The sample uses one render pixel per CSS pixel by default; `?dpr=1.5` or `?dpr=2` opts into higher resolution, and `?dpr=0.75` reduces it.

## Scope

The Sun lights the terrain directly; there is no sky or atmosphere. See [the library contract](../../packages/babylon-earth/README.md) for limitations, resource ownership and integration into another application. The WebGL variant is `/orbital.html?renderer=webgl`.

`npm run dev --workspace @spacexr/example-babylon-earth` runs the Vite development server without automatic browser opening.
