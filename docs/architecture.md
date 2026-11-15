# Framework layers and body compositions

## Generic foundation

`spacexr-tiling` owns tile addressing, topologies, generic surface mathematics and the tiling schemes, the cube included. `3d-tiles-core` owns wire contracts and the single 3D Tiles runtime. `terrain-core` owns raster and DEM data, grid geometry and sampling. `spacexr-rendering/packages/core` owns the existing Babylon integration. The current generic framework has no body catalogue, lunar production tools, provider URL presets or implicit Earth selection.

The application supplies a `GeodeticSystem`, surface/tiling and source metrics. Geometry uses these inputs without selecting a body. Datum transformations, geoid models or fallback height envelopes must also be explicit. Geodetic coordinate/CRS definitions remain mathematical and wire-format contracts, separate from a body's physical catalogue.

## Physical characteristics

`spacexr-celestial`, currently `@spacexr/celestial-core` in the local `celestial-core` repository, owns body characteristics. A composition obtains the body's ellipsoid and other physical parameters there and passes the required numerical objects to the framework. Generic packages do not import its catalogue. Demonstration fixtures can carry explicit body data; their values are examples, not library defaults.

## Babylon Earth library

`packages/babylon-earth` now implements `@spacexr/babylon-earth` as an optional composition. It combines Celestial ellipsoid/gravity and Sun direction, the existing implicit terrain adapter, one existing TileRuntime instance, camera and lighting. The atmosphere was removed on 2026-11-15 and will be reintroduced later. Generic packages do not acquire body-specific dependencies.

The host supplies its Babylon scene and engine and retains the render loop. The facade provides update, date and asynchronous disposal. Imagery residency follows terrain readiness and presentation, without another selector. Mercator remains the terrain projection; static polar placeholders close its uncovered poles without cube APIs.

The sample demonstrates orbital and terrain views. Automatic device-loss recovery remains later work. See [the library](../packages/babylon-earth/README.md) and [the samples](../examples/babylon-earth/README.md) for the exact current contract.
