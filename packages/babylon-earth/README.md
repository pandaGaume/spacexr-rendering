# @spacexr/babylon-earth

Optional Earth composition for an existing Babylon scene. Celestial owns Earth shape and gravity. The existing GPU terrain adapter keeps geometry camera-relative on both Babylon WebGPU and WebGL. The generic SpaceXR TileRuntime selects the implicit terrain and its imagery in one shared cut.

## Local setup

From the rendering repository run `npm run framework:install`, then `npm run framework:build`. Keep sibling repositories 3d-tiles-core, terrain-core, spacexr-tiling, quantia and celestial-core alongside rendering. Nothing has been published. Celestial and Quantia currently have private package metadata, so use the local workspace rather than assuming registry availability.

## Integration

```ts
import { createGeospatialRendererEngine, createGeospatialScene } from "@spacexr/3d-tiles-babylon";
import { createEarthRuntime } from "@spacexr/babylon-earth";

const { engine } = await createGeospatialRendererEngine(canvas, "webgpu");
const scene = createGeospatialScene(engine);
const earth = await createEarthRuntime(scene, {
    date: new Date("2026-06-21T12:00:00Z"),
    camera: {
        target: { latitudeDegrees: 25, longitudeDegrees: 0 },
        radius: 12_000_000,
        pitchRadians: 0,
    },
    // terrain: { elevation: { pyramid: yourDemPyramid }, imagery: yourRasterPagesOptions },
});
let stopped = false;
async function frame() {
    if (stopped) return;
    await earth.update();
    if (stopped) return;
    engine.beginFrame();
    scene.render(false);
    engine.endFrame();
    requestAnimationFrame(() => void frame());
}
requestAnimationFrame(() => void frame());

// On application teardown:
// stopped = true;
// await earth.dispose();
// scene.dispose(); engine.dispose();
```

The library creates no canvas, engine or render loop. Call `update` before beginning a Babylon frame, outside any open engine render pass. It owns its created camera, lights, terrain, imagery pages and labels. It borrows the scene, engine, optional existingCamera, supplied DEM and label layer. Await `dispose()` before destroying the scene or engine. It restores the previous active camera if its camera is still active. There is one actual TileRuntime instance, exposed as `earth.runtime`, and no independent imagery selector.

`setDate(date)` moves the Sun to its Celestial geometric direction at that date. Runtime errors can be observed through `onError` and the underlying runtime events.

## Scope

The Sun lights the terrain with a directional light and a dim ambient light; there is no sky or atmosphere. Terrain renders on Babylon WebGPU and WebGL.

Mercator terrain stops at approximately 85.05 degrees latitude. Static sea-level polar placeholders close the globe by default, using the Celestial ellipsoid. They are not polar imagery or DEM data. Set `polarCaps: false` to hide them. There is no cube implementation.

## Examples

The [Earth sample](../../examples/babylon-earth/README.md) uses this package. For consumption from another local project, extend [the framework dependency setup](../../docs/consume-framework.md) with this package and the Celestial link, then import its public API.
