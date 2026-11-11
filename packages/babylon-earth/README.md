# @spacexr/babylon-earth

Optional Earth composition for an existing Babylon scene. Celestial owns Earth shape and gravity. The existing GPU terrain adapter keeps geometry camera-relative on both Babylon WebGPU and WebGL. The generic SpaceXR TileRuntime selects the implicit terrain and its imagery in one shared cut. The public `@spacexr/atmosphere/webgpu` backend owns spectral scattering and LUT construction. The atmosphere bridge is internal to this package; no separate babylon-atmosphere package is introduced.

## Local setup

From the rendering repository run `npm run framework:install`, then `npm run framework:build`. Keep sibling repositories 3d-tiles-core, terrain-core, quantia, celestial-core and atmosphere-core alongside rendering. Nothing has been published. Celestial and Quantia currently have private package metadata, so use the local workspace rather than assuming registry availability.

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

The library creates no canvas, engine or render loop. Call `update` before beginning a Babylon frame, outside any open engine render pass. It owns its created camera, lights, terrain, imagery pages, sky resources and labels. It borrows the scene, engine, optional existingCamera, supplied DEM and label layer. Await `dispose()` before destroying the scene or engine. It restores the previous active camera if its camera is still active. There is one actual TileRuntime instance, exposed as `earth.runtime`, and no independent imagery selector.

`setDate(date)` resolves Celestial geometric Sun direction and replaces the immutable atmosphere snapshot. `setAtmosphereEnabled(boolean)` changes visibility. `setExposure(number)` changes display exposure. `atmosphereReady` means a completed sky snapshot is available. Runtime errors can be observed through `onError` and the underlying runtime events.

## Rendering contract and scope

Atmosphere requires Babylon WebGPU. WebGL terrain works with `atmosphere: false`; an atmospheric request on WebGL fails explicitly. The bridge is qualified against Babylon 9.33.x. Babylon exposes no public GPU-device getter in that version: the `_device` access and external-texture hardware view initialization are isolated in `src/atmosphere/babylon-sky.ts` and `native-surface.ts`. Upgrade that bridge and rerun browser qualification when changing Babylon versions.

Sky, orbital limb and finite-distance aerial perspective use the existing spectral backend with an isotropic higher-order scattering closure with 24 wavelengths by default. The backend owns optical integration and camera-volume construction. The native GPU-terrain fragment shader uses the projected position of the displaced surface. It composes `surface * transmission + inScatteredRadiance`, then applies exposure and sRGB encoding once. RGB transmission is a solar-spectrum-weighted approximation for RGB materials, not independent monochromatic transmittance. Clouds and atmospheric terrain shadows are outside this implementation. Earth supplies a 300 DU ozone absorption layer with a 10-40 km tent profile and published spectral cross sections; explicit custom physical layers replace that default composition. See [reference data and license](THIRD-PARTY-NOTICES.md).

There is no scene HDR render target, atmospheric camera post-process or FXAA pass. Atmospheric radiance and transmission are sampled in the existing GPU terrain material before its final output. The existing background layer draws the sky shader, and the ordinary terrain depth test occludes it. OFF restores the original terrain shader, uniforms, samplers and light convention, disables sky/atmosphere construction, and leaves the camera with no atmospheric post-process. Borrowed GPU volume resources remain owned by the spectral backend.

Translation completes a bounded low-resolution spectral sky cache at the current camera position before drawing. A separate higher-resolution cache refines at rest. An associated finite-distance camera volume updates when the view changes. The bridge waits for its previous GPU submission to prevent a queue of stale camera work. Outside the atmosphere, the angular cache concentrates its upper hemisphere on the physical limb instead of empty zenith sky. These resources share the backend's physical coefficients and solar transport.

`aerialPerspective` defaults to true. Set `aerialPerspective: false` only for a diagnostic background-sky comparison. `aerialQuality` controls the finite-distance volume, defaulting to 16 by 9 rays, 24 distances and two integration steps per slice while moving; the settled volume uses 32 by 18 rays, 32 distances and two steps. `motionQuality`, `quality` and `dispatchesPerFrame` control the spectral sky cache. Exposure defaults to 4 in the native atmosphere shader. Continuous-motion XR is not qualified. The camera must be unparented, perspective, symmetric, full viewport and above the physical ellipsoid. ECEF metres and a right-handed scene are required. Device loss is reported; automatic engine/device recreation belongs to the application.

Mercator terrain stops at approximately 85.05 degrees latitude. Static sea-level polar placeholders close the globe by default, using the Celestial ellipsoid. They are not polar imagery or DEM data. Set `polarCaps: false` to hide them. There is no cube implementation.

## Examples

Two separate HTML/TypeScript entry points are provided in [the Earth sample](../../examples/babylon-earth/README.md): orbital and inside the atmosphere. Both use this package. For consumption from another local project, extend [the framework dependency setup](../../docs/consume-framework.md) with this package and the Celestial/Atmosphere links, then import its public API.

The moving cache defaults to 16 azimuth texels, eight rows per hemisphere and 16 integration steps. `motionQuality` can override those geometric quality settings. The settled cache defaults to 64 azimuth texels, 32 rows per hemisphere and 64 steps. Both use the existing spectral backend and identical physical coefficients. The default progressive budget is two tasks per frame; movement completes the small cache synchronously in the GPU command stream. Orientation and projection changes count as motion, so they do not trigger settled-volume quality while the view is turning. CPU encoding overlaps the preceding GPU frame, with at most two atmosphere submissions outstanding. These caches are atmospheric render resources, not additional tile runtimes.

## Diffuse atmosphere

Earth enables `quality.multipleScattering` by default. The backend computes a small spectral altitude/Sun-zenith table once per immutable atmospheric snapshot and reuses it during camera motion. The table approximates higher-order scattering as isotropic, with the angularly averaged source divided by one minus the scattering-return probability. Its geometry is a two-dimensional local approximation on an ellipsoidal reference meridian; the direct view ray, terrain depth and solar transport remain ellipsoidal. Ground-reflected indirect light is not included. Disable this closure explicitly with `quality: { multipleScattering: false }` for a single-scattering comparison. Neither ozone nor this closure imposes a blue screen-space tint.

The native atmosphere shader and UI use the same initial exposure, including after a date change. Atmospheric radiance is adapted from the computed solar-continuum white point to the neutral RGB convention used by scene materials. The experimental monochromatic source bypasses this white adaptation. This display conversion leaves spectral LUT values and scientific CPU/GPU comparisons unchanged.

Native aerial perspective currently attaches to `GpuTerrainEngine.material`. With the mesh terrain engine only the background sky is drawn. A settled, unchanged view reuses its sky display texture without resubmitting atmospheric work. The example shows FPS and an Atmosphere ON/OFF checkbox in a fixed top-right HUD. Vite resolves atmosphere sources directly, so rebuilding the backend shaders cannot leave a stale renderer/backend combination in the development server.
