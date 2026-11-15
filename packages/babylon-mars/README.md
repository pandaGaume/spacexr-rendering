# @spacexr/babylon-mars

Mars composition for an existing Babylon scene, on the cube index of the SpaceXR tilings, poles included. One terrain `TileRuntime` selects the six faces of the cube, balanced across their edges; a second one selects the imagery pages when the body has imagery. The GPU terrain engine draws radial heights over the reference surface of the dataset, the oblate Mars 2000 ellipsoid included, in GLSL on WebGL and in WGSL on WebGPU. A camera orbits across the poles, and a directional Sun with a dim sky light lights the relief.

The body is an input: its reference surface, its DEM and its imagery. `loadMarsBody(service, decoder)` reads them from a tile service that publishes `elevation.json` and, optionally, `imagery.json` in the `spacexr-cube-equiangular/1` scheme. A caller can also build an `IMarsBody` from its own DEM pyramid. The package holds no body constant.

```ts
import { createGeospatialRendererEngine, createGeospatialScene } from "@spacexr/3d-tiles-babylon";
import { createMarsRuntime, loadMarsBody } from "@spacexr/babylon-mars";

const { engine } = await createGeospatialRendererEngine(canvas, "webgpu");
const scene = createGeospatialScene(engine);
const body = await loadMarsBody(serviceFolder, demDecoder);
const mars = await createMarsRuntime(scene, { body, camera: { latitude: 18.4, longitude: 77.6, radius: 90000, pitchRadians: 1 } });
engine.runRenderLoop(() => {
    mars.beforeRender();
    scene.render();
    mars.afterRender();
});
// On teardown: await mars.dispose(); scene.dispose(); engine.dispose();
```

The composition owns its camera, lights, terrain engine, imagery pages and runtimes; it borrows the scene, the engine and the DEM decoder. Settings live in `src/mars-config.json` and in `terrain-config.json` of the Babylon package.

This package mirrors `@spacexr/babylon-moon`; what the Earth, Moon and Mars compositions share is to be factored once all three exist.

See [the Mars sample](../../examples/babylon-mars/README.md).
