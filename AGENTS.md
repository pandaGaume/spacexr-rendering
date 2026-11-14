# SpaceXR Rendering

`packages/core` owns the existing `@spacexr/3d-tiles-babylon` adapter. Its package identity is unchanged.
`packages/tools` owns the shader compiler and existing terrain and renderer comparisons.
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

The user authorized the implemented optional packages/babylon-earth composition. Keep its Babylon atmosphere bridge internal until an actual second consumer justifies extraction. Reuse @spacexr/atmosphere/webgpu AtmosphereSky; never duplicate its scattering or LUT implementation here. Keep two working sample entry points: orbital.html and atmosphere.html. The user authorized finite-distance aerial perspective over actual scene depth. State WebGPU and the isotropic higher-order scattering approximation explicitly. Earth reference ozone belongs in babylon-earth; generic absorption layers and spectral transport belong in atmosphere-core. Keep spectral transport in atmosphere-core; the native terrain shader only reconstructs surface distance, samples transport and applies display encoding. The user rejected scene HDR and FXAA post-processes: do not reintroduce them. Always obtain explicit user approval before adding unrequested features, effects, dependencies or rendering passes. Maintain the one TileRuntime instance and shared terrain/imagery cut in Earth. Pin and qualify the Babylon 9.33.x internal device/texture bridge when upgrading.
