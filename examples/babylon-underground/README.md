# Underground rock example

The procedural rock of `@spacexr/babylon-underground` on a test cavity seen from inside. Everything is built in the page: no network, no texture, no other repository.

## Start

From `spacexr-rendering`:

```sh
npm run dev --workspace examples/babylon-underground
```

Then open [http://127.0.0.1:5193/](http://127.0.0.1:5193/). WebGL 2 is required.

## Scene

- **Cavity.** An icosphere of 120 m, 81 920 triangles, deformed by low frequency noise, half as tall as wide, with a flat floor 30 m below the centre. It has positions, normals and indices only, in metres, normals facing inward: what the real chamber mesh will provide.
- **Lighting.** `createChamberLighting`: a 3000 K lamp with physical falloff and a cold fill. The lamp casts shadows through a cube shadow map. Each view moves the lamp beside the camera and sets its intensity, as a lighting rig would, so the wall receives a comparable light at every distance.
- **Test objects.** Blue and orange drill hole tubes, 8 cm to 2.4 m across, and two blobs, partly emissive, to judge the contrast of the rock.

## Controls

| Key     | Action                                                       |
| ------- | ------------------------------------------------------------ |
| 1, 2, 3 | Views at 2 m, 20 m and 100 m from the same wall point        |
| A, B, C | Macro, meso and micro layers on or off                       |
| Q       | Quality: low, medium, high                                   |
| S       | Next seed                                                    |
| F       | Smooth or flat normals of the cavity                         |
| H       | Shadows on or off                                            |
| R       | Rock or plain PBR material                                   |
| M       | Frame time, rock and plain PBR, frames rendered back to back |

The mouse orbits around the wall point, the wheel zooms. URL parameters: `preset` (`near`, `mid`, `far`), `seed`, `quality`, `layers` (for example `ab`), `antialias=0`.

## Captures

With the example running, `npm run capture --workspace examples/babylon-underground` starts headless Chrome on the GPU, writes each view, each layer alone, the plain PBR material and a view turned by 0.004 rad to `screenshots/`, and the frame times to `screenshots/measurements.json`. It needs Node.js 22 and Chrome.
