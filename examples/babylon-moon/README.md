# Moon example

From spacexr-rendering, run `npm run example:moon`, then open http://localhost:5176/. It uses `@spacexr/babylon-moon`.

- Without parameters: a synthetic Moon, a sphere of the LOLA radius with deterministic craters, as a demonstration fixture, and imagery drawn locally (a checkerboard tinted by level).
- `?dataset=<folder of a revision>`: the body of a tile service, its DEM and its imagery when it publishes one. The folder holds `elevation.json` and `imagery.json`; their tile templates may be relative to them.
- `lat`, `lon`, `radius`, `pitch`, `yaw`: the point the camera orbits, in planetocentric degrees, the distance to it in metres, and the view angles in degrees.
- `renderer=webgpu`: the WebGPU engine and the WGSL shaders. `imagery=dataset|debug|none`, `grid=<cells>`, `sse=<pixels>`, `scale=<factor>`, `hud=0`, `monitor=0`, `motion=0`.

Drag to turn, use the wheel to zoom. The terrain bench runs its cube paths on this example: see `packages/tools/README.md`.
