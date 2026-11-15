# @spacexr/babylon-moon

Moon composition for an existing Babylon scene, on the cube index of the SpaceXR tilings, poles included. One terrain `TileRuntime` selects the six faces of the cube, balanced across their edges; a second one selects the imagery pages when the body has imagery. The GPU terrain engine draws radial heights, in GLSL on WebGL and in WGSL on WebGPU. A camera orbits across the poles, and a directional Sun with a dim sky light lights the relief.

The body is an input: its reference surface, its DEM and its imagery. `loadMoonBody(service, decoder)` reads them from a tile service that publishes `elevation.json` and, optionally, `imagery.json` in the `spacexr-cube-equiangular/1` scheme; any reference surface is accepted, a triaxial one included. A caller can also build an `IMoonBody` from its own DEM pyramid. The package holds no body constant.

```ts
import { createGeospatialRendererEngine, createGeospatialScene } from "@spacexr/3d-tiles-babylon";
import { createMoonRuntime, loadMoonBody } from "@spacexr/babylon-moon";

const { engine } = await createGeospatialRendererEngine(canvas, "webgpu");
const scene = createGeospatialScene(engine);
const body = await loadMoonBody(serviceFolder, demDecoder);
const moon = await createMoonRuntime(scene, { body, camera: { latitude: -89.67, longitude: 129.2, radius: 30000 } });
engine.runRenderLoop(() => {
    moon.beforeRender();
    scene.render();
    moon.afterRender();
});
// On teardown: await moon.dispose(); scene.dispose(); engine.dispose();
```

The composition owns its camera, lights, terrain engine, imagery pages and runtimes; it borrows the scene, the engine and the DEM decoder. Settings live in `src/moon-config.json` (camera limits, cache working set) and in `terrain-config.json` of the Babylon package (grid, thresholds, caches).

See [the Moon sample](../../examples/babylon-moon/README.md).
