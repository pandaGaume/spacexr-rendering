# SpaceXR Rendering

`packages/core` owns the existing `@spacexr/3d-tiles-babylon` adapter. Its package identity is unchanged.
`packages/tools` owns the shader compiler and existing terrain and renderer comparisons.
`packages/babylon-underground` owns the procedural rock material and the chamber lighting of underground views.
`examples` contains the Google 3D Tiles and implicit terrain applications.
The single runtime lives in `../3d-tiles-core`, tile addressing and tiling schemes in `../spacexr-tiling`; raster, DEM and grid live in `../terrain-core`.
Do not copy those implementations here. Do not add empty future packages or change algorithms during recomposition.
Keep Babylon types in the adapter. Future shared contracts and other adapters must remain independent of Babylon.
Prefix interfaces with `I`. Scenes use ECEF metres, right-handed coordinates and large-world rendering.
Write shaders in their own files. Never edit generated shader TypeScript; run `npm run shaders`.
Applications explicitly register loaders. Do not infer content format from a URI extension.
Run `npm run framework:check` to check sibling core, terrain, adapter, tools and examples in order.
Never measure against an existing development server without stating which sources it serves.
No publication or repository push without explicit authorization. Never use the em dash character.

## Body-neutral framework

Cube implementations, body-specific production tools and provider presets do not belong to the active generic packages. Physical surface and geodetic parameters are explicit inputs, supplied by an application or a body composition using spacexr-celestial. Body-specific constants are permitted in demonstration fixtures. Earth/Babylon/atmosphere composition belongs in the optional babylon-earth package; do not create empty future packages.

## Earth composition

The user authorized the implemented optional packages/babylon-earth composition. The atmosphere (atmosphere-core) was removed from this repository on 2026-11-15 and will be reintroduced later: do not depend on @spacexr/atmosphere until then. The user rejected scene HDR and FXAA post-processes: do not reintroduce them. Always obtain explicit user approval before adding unrequested features, effects, dependencies or rendering passes. Maintain the one TileRuntime instance and shared terrain/imagery cut in Earth.
