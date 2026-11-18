# Changelog

All notable changes to this package will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- `createRockNoiseTexture`, `bakeRockNoise` and `rockNoiseAt`, and the `noise` option of `createRockFaceMaterial` and `RockFacePlugin`: the noise of the relief of a rock face baked into a 3D texture that repeats (128 texels a side, half floats), read once an octave where the shader hashes the eight corners of a cell. Computed in the shader by default, as before. Timed on a computer at 13 million pixels an image, with seven octaves and the grain, on three views of the excavation example: 12 to 19 ms an image baked, 26 to 32 computed, a flat colour taking 7 to 8.
- `createRockFaceMaterial` and `RockFacePlugin`: the relief per pixel of a rock face built by `buildRockFace` of `@spacexr/ceiling`, from the SpaceXR V26 rock walls (fBm of 3D value noise with its exact gradient at the world position, hollows darkened, grain), on a PBR or a standard material, its octaves a define for mobile headsets. Moved from the Studio of geomodels-explorer, which now imports it from here. Checked by eye in a browser on WebGL 2; nothing measured.

- `@spacexr/babylon-underground`: `createRockMaterial` and `RockMaterialPlugin`, a procedural rock on a Babylon.js PBR material, in albedo, normal, roughness and ambient occlusion, from mesh-local positions in metres, without UVs or tangents; GLSL on WebGL 2. Three scales: macro tone and strata, meso joint sets and Voronoi fragments, micro grain and fine cracks, each band limited by its pixel footprint, with a quality level. JSON settings with a seed, one documented preset `ROCK_PRESET_DARK_SLATE`, validation reporting every problem. `createChamberLighting`, a 3000 K mining lamp with physical falloff and a weak cold hemispheric fill. Measured on an Intel Arc 140T at 1280 x 800, shadows off: about 3.5 to 5 ms per frame with the rock against 0.5 to 1 ms with the plain PBR material, about 2 ms at `low` quality.
