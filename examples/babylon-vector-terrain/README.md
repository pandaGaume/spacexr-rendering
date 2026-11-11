# Vector tiles draped on Mapzen terrain

Run from `spacexr-rendering`:

```sh
npm run example:vectors
```

Open http://127.0.0.1:5191/. This example serves the local `terrain-core/packages/vector` and rendering sources. It uses one `createEarthRuntime` instance and its existing implicit 3D Tiles selection, DEM workers, GPU terrain, raster pages and draping tables. It adds no camera post-process or rendering pass. Atmosphere is disabled for this sample.

The demonstration contains a fictional cyan trace, a yellow polygon with a transparent hole, and pink multipoints around Mont-Blanc. These are local fixtures, not surveyed trails. Actual relief uses the existing Mapzen Terrarium source on AWS Open Data, with its standard DEM pyramid. No imagery provider or vector API key is required.

Geometry is projected and prepared once per requested LOD. Twenty-seven transparent tiles around the target at LOD 11, 12 and 13 are precalculated before starting; later selection uses the same bounded raster cache. The source stays independent of the terrain geometry. `styleLOD: 12` anchors widths and point radii to fixed map dimensions: they do not inflate when the terrain temporarily displays a coarser tile. Screen width changes naturally with camera distance.

Transparent imagery alpha is mixed with the terrain base colour directly inside the existing GPU material, in both WGSL and GLSL. Opaque imagery retains its prior output. The final terrain stays opaque and depth-tested, including the draped vectors. This sample uses the GPU terrain path.

Mouse and wheel use the existing camera controls. The status shows FPS, displayed terrain tiles, prepared LODs and cached RGBA tiles. First loading depends on Mapzen availability. Sources: `src/fixtures.ts` and `src/main.ts`.
