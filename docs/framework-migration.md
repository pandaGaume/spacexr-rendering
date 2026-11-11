# Framework migration

The canonical package owners are `3d-tiles-core` (wire model, tiles and runtime), `terrain-core` (raster, DEM and grid), and `spacexr-rendering` (Babylon integration, tools and samples). Their relative sibling links and lockfiles provide the local development framework.

The subsequent cleanup removes cube APIs, datasets and sample lunar tooling from the active framework. Physical parameters are explicit: configure `GeodeticSystem`, source metrics and terrain tiling. Datum transformations and unknown-height envelopes also require caller policy. Former `TILE_METRICS` and Mapzen provider exports are no longer library defaults; the Earth sample supplies its own configuration.

The optional `@spacexr/babylon-earth` composition now lives in `spacexr-rendering/packages/babylon-earth`. It combines Celestial physical descriptors, the existing tile runtime, terrain, camera and the public spectral atmosphere integration. Generic packages remain independent of any body catalogue.

Open `SpaceXR-Framework.code-workspace` for library development; the applications workspace now includes only the reference demonstrations. Body-specific Explorer and tile-service integrations remain separate projects for later work. The legacy Babylon root commands still forward to rendering.

Retired source directories and initial files remain in local ignored migration backups, outside active package exports. No commit, repository push or npm publication has been performed. These local API changes need coordinated versioning before any eventual release.
