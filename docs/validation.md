# Generic framework qualification

Date: 2026-11-10. The current scope is the standalone 3D Tiles and terrain framework after repository recomposition and removal of cube APIs, lunar preparation tools and implicit body defaults. The previous migration-only qualification predates this API cleanup and must not be used as evidence for current consumer compatibility.

## Current results

`npm run framework:check` passes across core, terrain and rendering: 561 tests, formatting, lint, type checking, shader generation, package builds and both demonstration production builds. Removed cube/body-specific tests explain the reduction from the historical 679-test recomposition baseline. New tests exercise explicit synthetic surfaces, scale-dependent metrics, grid geometry and caller-supplied geoid/height policy.

`npm run framework:verify` verifies all seven public package identities and canonical links from rendering, its Babylon adapter and both demonstrations. `npm pack --dry-run --json --ignore-scripts` confirms compiled JavaScript and declarations in all seven payloads, with no retired cube/lunar package paths. Nothing was published.

The active generic implementation sources contain no cube projection or Earth/Moon/Mars selection and no WGS84/radius defaults. Mathematical surface helpers remain under the public `tiles/surface` entry. Physical characteristics belong to Celestial; demonstrations explicitly choose their surface. Five VS Code workspaces have existing folder paths. The applications workspace contains the reference demonstrations; specialist consumers remain separate.

## Browser smoke check

An isolated Vite server at port 5187 serves the canonical terrain example. The fixed Mont Blanc GPU terrain with DEM-derived normals, `sse=512`, completes under WebGL/GLSL and WebGPU/WGSL without page or GPU validation errors at a 1500-request limit. The screenshots differ in 601 of 905760 pixels, about 0.066 percent. This verifies working rendering on this view, not pixel identity or a complete visual regression suite.

The first cold run hit the 400-request limit in WebGL and is recorded as failed. Its images are not accepted as qualification evidence. The accepted rerun uses the same fixed view with an increased request limit. Google streaming was built and covered by adapter tests, but was not exercised against external credentials in this run.

## API and consumer limits

Applications must supply their geodetic system, metrics and terrain tiling. Datum transformations, geoid margins and unknown-ground height envelopes require explicit policy. Cube APIs, the shared `TILE_METRICS` preset and library Mapzen provider factories were removed. Provider factories now belong to the Earth demonstration. These are intentional API changes requiring coordinated versioning before release.

The earlier migration-only studio and tile-service checks are historical results. They were not rerun after these API changes. Explorer's cube integration and body-specific service tools remain outside the qualified framework workspace and require later adaptation. Their repositories and histories are preserved.

The optional Earth composition is implemented and qualified separately below. See [architecture](architecture.md).

## Local delivery

No commit, push, tag or publication has been performed. Retired sources are recoverable in local migration backups. The body-neutralization audit is stored under `SpaceXR/.cache/body-neutralization`; command logs are under `SpaceXR/.cache`. The original staged runtime tests remain in the Git index. API adaptations are local working-tree changes.

## Earth composition qualification

Date: 2026-11-10. The final rendering `npm run check` passes: package/example builds, format, lint, type checking and 172 tests, including eight Earth model/camera/lifecycle/imagery tests. The unchanged core and terrain checks in this delivery passed 213 and 184 tests respectively, bringing the checked framework total to 569. Quantia, Celestial and Atmosphere were built through the public dependencies; this is integration qualification, not a new independent scientific qualification of those models.

`framework:verify` resolves all ten packages through actual ESM import conditions, including Earth, Celestial and Atmosphere. The compiled Earth entry imports successfully outside the sample source aliases. Its npm dry-run payload contains JavaScript, declarations, source, README and license; no publication occurred.

Both independent HTML/TypeScript entries run in Chrome with hardware-backed WebGPU. Measured camera ellipsoidal heights are 11999997.924 m for orbital.html and 10978.807 m for atmosphere.html. The latter completes loading the real Mapzen DEM and displays 136 selected implicit terrain tiles in the captured view. The test waits for submitted GPU work and records zero uncaptured GPU validation events, page errors or console errors. Screenshots and data are under `SpaceXR/.cache/earth-validation` (orbital.png, atmosphere.png and two-pages.json). These are two smoke views, not exhaustive numerical or device coverage.

The interaction check exercises atmosphere visibility, changed Sun/date, camera movement, resized viewport and explicit WebGL terrain-only mode. It confirms that Earth disposal removes owned meshes, lights and camera while preserving the borrowed scene. No browser errors were reported. Eight unit tests cover catalogue shape/gravity reuse, solar direction, camera handedness, actual TileRuntime composition, explicit WebGL atmosphere rejection and imagery readiness/residency cleanup.

The selected Earth default is the existing GPU terrain adapter, which keeps geometry camera-relative and avoids the visible precision artifacts seen in the initial absolute-coordinate mesh smoke. The mesh adapter remains available through terrain.engine. The attempted reverse-depth sample configuration was removed; it is not part of this qualification. No generic terrain or tile-selection algorithm was changed for Earth.

Earth uses the existing Mapzen DEM chain and configured local tiled-imagery loader for both sample entries, with one TileRuntime instance and shared raster/terrain residency. Atmospheric transport is composed against the actual displaced-terrain depth. Its camera-volume depth coordinate stays continuous across the reference ground tangent, checked against a finite-distance CPU reference and a crest above the horizon. Clouds, continuous-motion XR and automatic device recreation are not included. Static polar caps are placeholders beyond Mercator. See the [library contract](../packages/babylon-earth/README.md) and [both sample entries](../examples/babylon-earth/README.md).

## Follow-up: moving camera, sunset, Mapzen and SSE

The initial static smoke qualification did not establish correct moving-camera compositing or interactive performance. User feedback exposed a vertically flipped WebGPU display texture, a frozen image during progressive translation bakes, missing direct solar-disc rendering, and expensive close-view DEM decoding on the main thread. The earlier engine-reported FPS figures must not be interpreted as GPU-completion latency measurements.

The Earth bridge now flips/clamps its display texture, clips interpolated sky radiance to the backend's analytic atmosphere interval, completes a small current-position spectral cache while moving, and refines a separate cache only at rest. CPU encoding overlaps the preceding GPU submission, with at most two atmosphere submissions outstanding. Orientation and projection changes count as motion for settled-cache selection. The solar disc uses the same spectral irradiance and transmission as the sky. No optical coefficients or scattering model were changed.

The close view reuses the existing Mapzen Terrarium source factory with the Celestial Earth system, its original terrain configuration, child height ranges, DEM generation/interpolation and GPU terrain engine. DEM decoding uses two existing decoder workers. Both samples use the existing local tiled-imagery loader. Both samples default to SSE 20 px, configurable with sse, and one render pixel per CSS pixel, configurable with dpr. Runtime telemetry is collected four times per second instead of traversing every runtime node each frame.

The corrected sunset preset targets the Sun above the geometric horizon with a small clearance for the actual terrain. In the stabilized captured Mapzen view it uses 37 implicit terrain tiles, two decoder workers and only Mapzen Terrarium DEM URLs. There are no page, console or uncaptured WebGPU errors. The captured Sun remains visible after the DEM finishes refining.

The camera regression moves the Earth centre and inclines the view with its orbital pitch lock disabled. The projected globe centre moves from screen row 482.3 to 525.4. All four views have zero bright pixels beyond the CPU-computed atmospheric envelope plus a two-source-texel filtering margin. This checks genuinely off-centre views, not just longitude changes with a centred globe.

The earlier manual benchmark waited for GPU completion after each explicitly rendered image. Its latency numbers did not reproduce continuous RAF motion and must not be used as evidence that interactive performance was fixed. A subsequent real rotation exposed 6 to 7 FPS with atmosphere versus 120 FPS without it, dominated by approximately 125 ms of spectral Sky-View work and 20 ms of aerial-volume work.

The earlier rendering workspace check passed 176 tests, type checking, lint, formatting and all builds. Targeted regression tests additionally assert that no older-position cache is published during startup/movement, that rotation redraws without rebuilding optical tables, that texture UV/clamp state is correct and that GPU work cannot accumulate across frame submissions. Provider tests confirm that the shared Mapzen source honours an explicit surface without changing its Terrarium URL/encoding. The changed package and sample were rebuilt after the final texture-edge and sunset adjustments.

## Continuous-motion atmosphere correction

The solar-column LUT now follows the ellipsoid's altitude-dependent solar tangent and concentrates its longitude samples on illuminated paths. Exact analytic occultation and the direct-integration fallback remain enabled. Spectral Sky-View tiles share a dispatch within the existing construction-task budget. The aerial pass distributes wavelength groups across threads and reduces their XYZ contributions in workgroup memory using the common finite-segment integrator. Neither LUT resolution nor spectral coefficients were reduced. No rendering pass, dependency, HDR target or FXAA effect was added.

The actual RAF measurement at 2560 by 1440 uses Chrome WebGPU with D3D11, the existing Mapzen DEM, local Google tiled imagery and SSE 20. Each ON/OFF run restores the same camera pose, warms continuous motion for 1.2 seconds, then counts completed sample frames over 3.5 seconds. Rotation advances yaw at 0.1 radians per second; translation moves the centre at 20 metres per second along ECEF X. These are local machine measurements, not a general device guarantee.

| View               | Rotation OFF | Rotation ON | Translation OFF | Translation ON |
| ------------------ | -----------: | ----------: | --------------: | -------------: |
| Terrain, 10:00 UTC |          117 |          59 |             118 |            110 |
| Terrain, sunset    |          111 |          63 |             118 |            111 |
| Orbital horizon    |          120 |          42 |             120 |            120 |

All three return to approximately 120 FPS at rest. The same TileRuntime remains in use, camera post-process count is zero, image processing through a post-process is disabled, and no page or console errors are reported. Atmospheric rotation still has measurable overhead, especially in the orbital view; these results do not claim parity with the OFF path. The final-frame screenshots show blue distance haze over real relief by day, a warm sunset horizon behind the mountains, and a diffuse orbital limb. Source-level circle coverage for the existing solar disc is applied after display mapping to prevent its antialiased edge from saturating into a square.

The reproducible measurements and screenshots are under `SpaceXR/.cache/resume-validation`; the real-motion driver is `SpaceXR/.cache/resume-real-motion.cjs`. Final `npm run check` succeeds in rendering (180 tests) and atmosphere (28 package tests plus 61 laboratory tests). `npm run framework:check` succeeds across the existing sibling framework. Final `npm run test:webgpu` succeeds with 28 cases and no failures, including finite-distance volume and ground-tangent continuity checks. Both atmosphere and Earth pass `npm pack --dry-run`. The final browser check confirms OFF/ON and date replacement preserve the camera and TileRuntime, with zero GPU validation events. OFF matches the terrain-only baseline exactly in the compared image region. Backend checks, renderer checks and GPU scientific qualification are logged under `SpaceXR/.cache/resume-*`. No commit, push, tag or publication was performed.

## Orbital vacuum-transport follow-up

A real rotating-camera GPU profile identified approximately 10.17 ms of Sky-View calculation, 2.65 ms of aerial-volume calculation, 1.22 ms of sky display and 5.54 ms of terrain rendering with atmosphere active. The terrain-only pass was approximately 3.75 to 4.19 ms; CPU scene update and rendering were approximately 1 to 2 ms without atmospheric waiting. CPU atmosphere-update time included waiting for GPU completion, so that wait must not be added to the GPU pass times as separate compute work.

The transport integrator now skips a midpoint when all local layer densities are exactly zero. Such a point contributes exactly zero source and extinction, independent of its solar column. In particular, empty parts of the conservative outer envelope no longer trigger expensive solar integrations. No threshold, integration step, LUT dimension, wavelength count, optical coefficient, pass, effect or dependency changed. Trials with shared geometric workgroups were removed because the existing kernel with this exact vacuum check delivered the same practical gain.

The final five-second continuous RAF rotation test at 2560 by 1440, SSE 20 and the same restored camera pose measured 116.3 FPS with atmosphere absent from construction, 120.0 FPS with the checkbox OFF, 80.3 FPS ON, then 118.8 FPS after returning OFF. This test contains no injected GPU timestamps. Shorter real-motion GPU profiles measured 88.6 to 91.8 FPS ON. The remaining overhead is visible; these numbers do not claim 120 FPS with atmosphere enabled.

With the final minimal shader, median GPU times in motion were 0.82 ms for Sky-View, 1.84 ms for the aerial volume, 1.14 ms for sky display and 4.73 ms for the terrain pass. The expensive solar work at zero-density view points accounts for most of the removed time. All valid profiles report zero GPU validation events. The sampler still uses the original quality and cache configuration.

Reproduction scripts and data are under `SpaceXR/.cache/orbit-*`. In particular, `orbit-final-cpu.cjs` and `orbit-final-cpu/result.json` contain the frame-rate comparison without GPU timestamps; `orbit-baseline-gpu.json` and `orbit-minimal-gpu.json` contain the before/after real-motion GPU stage profiles. Initial profiling attempts with an oversized timestamp query set were discarded, and only profiles with zero captured GPU validation events are accepted here.

The follow-up backend check passes 28 package tests and 61 laboratory tests; the framework check also succeeds. The final WebGPU suite passes all 28 cases. Its complete case results, aerial-volume results and horizon-continuity results are identical to the previous validation report. Final day, sunset and orbital captures use the existing loaded Mapzen terrain and imagery, with zero pending loads, GPU validation events, page errors or camera post-processes. The captures are under `SpaceXR/.cache/orbit-visual-validation`, and the complete result is `SpaceXR/.cache/orbit-optimization-result.json`.

## Babylon Earth test entry points

The maintained browser checks now belong to `examples/babylon-earth/scripts/browser` in this rendering repository. Run `npm run example:earth` to serve this checkout on port 5189 and open both sample pages. Run `npm run test:earth:motion`, `test:earth:views`, `test:earth:gpu`, `test:earth:visual` or `test:earth:native` for the corresponding checks. Tests verify the server's source checkout before reusing it, and results are written to `.cache/babylon-earth/{motion,views,gpu,visual,native}`. Accepted historical GPU/scientific reports are copied to `.cache/babylon-earth/history`.

Earlier sections retain the locations used when those historical measurements were made. Those legacy cache paths are not entry points or dependencies of the maintained tests. See [the sample commands](../examples/babylon-earth/README.md#browser-validation).

## Cached imagery reactivation regression

A real orbiter-to-terrain-to-orbiter round trip reproduced missing textures. The GPU indirection tables contained -1 for all 34 displayed globe tiles after returning from the terrain view; network and GPU validation errors were absent. EarthTerrainAdapter activated cached content even when pendingContents was empty, loaded its already resident page, then released it because no new terrain handle had been accepted. This invalidated imagery still owned by the cached terrain handle.

An empty activation now leaves the existing handle and its imagery untouched. A regression test failed before this guard and passes afterward. The same real navigation sequence, including continuous rotation and repeated returns to terrain, now reports zero displayed tiles without resident imagery and zero missing GPU table entries. The visual browser command checks this cached round trip in addition to fresh views, and waits for a stable idle load queue before capture. The orbital motion benchmark also rejects missing imagery rather than accepting high frame counts with untextured terrain.

At 2560 by 1440 in the new five-second real RAF rotation test, atmosphere absent from construction measured 118.0 FPS; checkbox OFF 113.6 FPS; ON 104.3 FPS; return OFF 118.7 FPS. All reported modes had zero missing imagery and zero GPU validation events. These are local samples, not a universal target rate. Earlier rates around 60 FPS were not evidence of an explicit 60 FPS cap: the sample has an asynchronous requestAnimationFrame loop whose next request follows update and GPU backpressure. At a 120 Hz cadence the frame budget is 8.33 ms; overruns can miss presentation opportunities. A refresh-rate cap in the user's precise tab was not measured and should not be asserted from headless benchmark data.

The final strict browser rerun reports zero missing own imagery pages and zero missing GPU bindings in all six captures, including the cached return to the whole globe and back to terrain. The last orbital motion run measured 120.2 FPS without atmosphere at construction, 119.6 OFF, 100.7 ON and 119.8 after returning OFF, with no missing imagery in any recorded mode. Sixteen Earth unit tests pass, along with Earth lint/type checking and the sample's complete check. The full framework command was attempted but stopped on an unrelated unused runtime binding at packages/babylon-gltf-ext/tests/runtime.test.ts:350; that test file was left untouched. Results are recorded in `.cache/babylon-earth/texture-fix-result.json`.
