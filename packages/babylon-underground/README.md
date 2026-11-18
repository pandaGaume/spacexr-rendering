# @spacexr/babylon-underground

Babylon.js 9 materials and lighting of underground views: a procedural PBR rock for the walls and ceiling of an observation chamber, and the light rig of a mining chamber. Purely decorative: the rock makes no geological claim.

| Export                                       | Role                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `createRockMaterial`, `RockMaterialPlugin`   | PBR material with a procedural rock in its albedo, normal, roughness and AO  |
| `createRockSettings`, `validateRockSettings` | JSON settings of the rock, from the one preset, with clear errors            |
| `ROCK_PRESET_DARK_SLATE`                     | The preset: dark slate grey, rock brown, a discreet ochre                    |
| `createChamberLighting`, `kelvinToLinearRgb` | A warm mining lamp and a weak cold fill                                      |
| `computeRockUniforms`, `rockCustomCode`      | What the material sends to the shader, for tests and inspection              |
| `createRockFaceMaterial`, `RockFacePlugin`   | The relief per pixel of a rock face built by `buildRockFace` of terrain-core |

## Requirements

- WebGL 2 (`Engine`), GLSL. The plugin refuses WebGL 1 and WebGPU when it is added. The snippets are organised so that a WGSL twin can be added under `shaders/wgsl`, as in the core package; it is not written.
- A mesh with positions in metres, near its origin, and normals for smooth shading. No UVs, no tangents. The rock is a solid texture of the mesh-local position: its scale does not depend on the mesh density, and a mesh with a world scale other than 1 stretches the slopes of the relief.

## Use

```ts
import { createChamberLighting, createRockMaterial, createRockSettings } from "@spacexr/babylon-underground";

const rock = createRockMaterial("rock", scene, createRockSettings({ seed: 42 }));
chamber.material = rock.material;
chamber.receiveShadows = true;

const lighting = createChamberLighting(scene, { lamp: { position: [0, 4, 0], intensity: 900, range: 120 } });

// Later: only uniforms change, no recompilation.
rock.plugin.setSettings(createRockSettings({ seed: 42, micro: { enabled: false } }));
```

Lighting, shadows, fog and image processing stay those of the PBR material. The plugin owns the roughness of the material; its albedo colour tints the rock. `material.enableSpecularAntiAliasing` is on.

## Settings

A plain JSON object; the same settings and seed always give the same rock. `createRockSettings(overrides)` merges overrides into the preset field by field, replacing palettes and vectors whole, then validates. `validateRockSettings(json)` checks settings read from a file and reports every problem with its path, unknown fields included: a misspelt setting never falls back on a default. Lengths are in metres.

| Setting                                                    | Preset                          | Meaning                                                                          |
| ---------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `seed`                                                     | 1                               | Unsigned 32-bit integer                                                          |
| `palette`                                                  | 5 tones, `#282b30` to `#5d5143` | 3 to 5 sRGB tones, a path from the first to the last                             |
| `quality`                                                  | `high`                          | `low`: macro and joint blocks; `medium`: plus fragments; `high`: plus micro      |
| `surface.roughness`, `roughnessVariation`                  | 0.88, 0.06                      | Matte base, change by tone and block                                             |
| `surface.grainRoughness`, `distantRoughness`               | 0.05, 0.04                      | Grain nuances; roughness that replaces relief too fine for the pixels            |
| `surface.specular`                                         | 0.5                             | Factor of the 4 % dielectric reflectance                                         |
| `surface.normalStrength`, `occlusionStrength`              | 1, 0.4                          | Relief in the normal; ambient occlusion of the cracks                            |
| `macro.enabled`, `scale`, `toneContrast`                   | true, 30, 0.55                  | A: low frequency tone over the palette                                           |
| `macro.strataNormal`, `strataThickness`                    | [0.22, 0.95, 0.2], 3.5          | Bedding planes                                                                   |
| `macro.strataWarp`, `strataWarpScale`                      | 1, 22                           | Bending of the beds                                                              |
| `macro.strataContrast`, `strataRelief`, `strataTransition` | 0.15, 0.04, 0.06                | Tone and step between beds, step width as a fraction of a bed                    |
| `meso.enabled`, `fractureNormal`, `anisotropy`             | true, [0.85, 0.15, 0.5], 1.8    | B: dominant joint set, `cellSize / anisotropy` apart                             |
| `meso.fractureVariation`                                   | 0.6                             | Calmer and more fractured regions                                                |
| `meso.cellSize`, `secondaryCellSize`, `secondaryWeight`    | 4, 0.9, 0.35                    | Block size (minor joint sets), fragment size and strength                        |
| `meso.facetSlope`, `toneVariation`                         | 0.3, 0.06                       | Flat facet of each block; tone between blocks                                    |
| `meso.bendAmplitude`, `bendScale`                          | 0.5, 12                         | Bending of the joint planes                                                      |
| `meso.crackWidth`, `crackDepth`, `cavityDarkening`         | 0.04, 0.03, 0.15                | Open cracks; albedo darkening at their bottom, at most 0.35                      |
| `micro.enabled`, `scale`, `relief`, `fineCrackDepth`       | true, 0.16, 0.007, 0.002        | C: four grain octaves from 16 cm down, and fine cracks                           |
| `detail.enabled`, `scale`, `strength`                      | false, 0.5, 0.3                 | Optional triplanar detail normal map, `plugin.detailNormalTexture`; none shipped |

## How the rock is computed

Everything is a function of `p`, the mesh-local position plus a seed offset below 256 m, so 32-bit floats keep their precision. Each layer returns the analytic gradient of its height in rock space; the normal is perturbed with Mikkelsen's surface gradient, without tangents, the screen derivatives of the height being that gradient projected on the screen derivatives of `p`. The normal is therefore exact at each pixel, not a difference between neighbouring pixels.

- **A, macro.** Two octaves of value noise pick the tone in the palette. Beds along `strataNormal`, bent by a noise, step the tone and the relief.
- **B, meso.** Three joint sets of parallel, jittered, bent planes cut angular blocks. A noise along each plane opens it in patches, more often for the dominant set; open joints are grooves feeding the ambient occlusion and a capped albedo darkening. Each block has a flat facet and a tone. Voronoi fragments in a space stretched across the dominant joints, rotated by the seed, add smaller blocks; half of their edges are open cracks.
- **C, micro.** Four octaves of value noise, each rotated, and thin ridges where a noise crosses zero, in normal and roughness only.
- **Filtering.** Procedural patterns have no mipmaps. Each pattern fades from 10 to 2.5 pixels per period, by the pixel footprint `max(|dp/dx|, |dp/dy|)`; cracks never get thinner than 1.5 pixels and keep their section when widened; lost micro relief becomes roughness. The `quality` level skips the fragments and the micro layer.

The occlusion is injected after the statement `float microSurface=reflectivityOut.microSurface;` of the PBR shader of Babylon.js 9.33, which has no named point there; a test fails if a Babylon.js update removes it. The occlusion multiplies `aoOut`, which Babylon.js also applies to direct diffuse light when the material has no ambient texture.

## Chamber lighting

`createChamberLighting(scene, overrides)` creates a point lamp of 3000 K, physical inverse square falloff, intensity in candela and a range, and a hemispheric fill from above, bluish, at 8 %, without specular. No environment texture. Shadows come from a `ShadowGenerator` of the application on `lighting.lamp`.

## Rock face

A rock face is a mesh that `buildRockFace` of `@spacexr/ceiling` (terrain-core) has refined and moved into the rock, with every wavelength of its rock field over `detailWavelength` and none under it. `createRockFaceMaterial(name, scene, { detailWavelength })` draws what is under, per pixel: a rough dark PBR material whose plugin, `RockFacePlugin`, tilts the normal by an fBm of 3D value noise with its exact gradient, read at the world position, darkens the hollows and adds a grain to the albedo at 2.2 m and 0.6 m. Its largest octave is `ROCK_FACE_HANDOVER` (0.6) times `detailWavelength`; each octave halves the one before, and octaves under about two pixels fade out.

```ts
import { createRockFaceMaterial } from "@spacexr/babylon-underground";

const face = buildRockFace(mesh, { edgeLength: 4, maxDisplacement: 2, scale: 0.1 }); // @spacexr/ceiling
const rock = createRockFaceMaterial("rock", scene, { detailWavelength: face.detailWavelength, octaves: 7 });
chamber.material = rock.material;
rock.plugin.detail.strength = 1.2; // seen on the next frame
```

`octaves` (7 by default, 1 to 10) is a define: each costs eight hashes a pixel when the noise is computed in the shader, which is nearly all of what an image of the rock costs.

The noise can be baked instead, and read from a 3D texture, one read an octave: the same rock, two to four times cheaper to shade, which is what a mobile headset needs to draw all of it.

```ts
import { createRockFaceMaterial, createRockNoiseTexture } from "@spacexr/babylon-underground";

const noise = createRockNoiseTexture(scene); // one for the scene: 128 texels a side, 16 MB in half floats
const rock = createRockFaceMaterial("rock", scene, { detailWavelength: face.detailWavelength, noise });
```

The texture repeats, so the baked noise does: every 32 cells of its lattice, 32 wavelengths of each octave (some 150 m for the largest octave of a face whose mesh stops at 8 m). It is not the noise of the shader point for point, whose lattice does not repeat, but the same noise on another lattice. `bakeRockNoise` gives the numbers alone, and `rockNoiseAt` the noise at a point.

`detail` (`strength`, `cavity`, `grain`) changes without recompiling; a grain of 0 skips its cost. The plugin also works on a `StandardMaterial`. GLSL on WebGL 2 only: elsewhere it stands aside. Unlike the rock above, it reads world positions: two meshes side by side share one rock.

## Shaders

Snippets live in `src/rock/shaders/snippets/*.glsl` and `src/rock-face/shaders/snippets/*.glsl`. Never edit the generated `.ts` beside them: run `npm run shaders`. The tests fail when a generated module is out of date.
