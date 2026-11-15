# Mars example

From spacexr-rendering, run `npm run example:mars`, then open http://localhost:5177/?dataset=<folder of a revision>. It uses `@spacexr/babylon-mars`.

- `dataset` is required: the folder of a Mars revision of a tile service, which holds `elevation.json` and, when published, `imagery.json`. Their tile templates may be relative to them.
- `lat`, `lon`, `radius`, `pitch`, `yaw`: the point the camera orbits, in planetocentric degrees (Jezero crater by default), the distance to it in metres, and the view angles in degrees.
- `renderer=webgpu`: the WebGPU engine and the WGSL shaders. `imagery=dataset|debug|none`, `grid=<cells>`, `sse=<pixels>`, `scale=<factor>`, `hud=0`, `monitor=0`, `motion=0`.

Drag to turn, use the wheel to zoom.
