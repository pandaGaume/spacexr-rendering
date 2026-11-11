<img src="https://raw.githubusercontent.com/pandaGaume/3d-tiles-core/main/assets/brand/spacexr-component.png" alt="SpaceXR Component" height="56">

# @spacexr/babylon-gltf-ext

Babylon.js 9 support for SpaceXR glTF node extensions that belong to no other package: their loaders, their exporters and the runtime that applies them in a scene.

| Extension                  | Role                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `SPACEXR_ground_reference` | Places the origin of a node on the ground the client displays |

The extension is listed in `extensionsUsed` and never in `extensionsRequired`: a client that does not know it shows the node with the transform written in the glTF.

Related extensions live with the code they need:

| Extension                                                               | Package                                 |
| ----------------------------------------------------------------------- | --------------------------------------- |
| `SPACEXR_label`                                                         | `@spacexr/spatial-label-layout-babylon` |
| `EXT_mesh_features`, `EXT_instance_features`, `EXT_structural_metadata` | `@spacexr/3d-tiles-babylon`             |

## Install

```bash
npm install @spacexr/babylon-gltf-ext @babylonjs/core @babylonjs/loaders
```

`@babylonjs/loaders` is needed to read glTF, `@babylonjs/serializers` to write it. Each is used by its own entry point only.

## The ground reference extension

```json
"SPACEXR_ground_reference": { "offset": 1.2 }
```

The origin of the node stands on the ground the client displays, on the vertical of the position written in the glTF, raised by `offset` metres along that vertical. `offset` defaults to 0. The extension applies to any node: a label, a drill collar, a building.

## Reading

```ts
import "@babylonjs/loaders/glTF/2.0/index.js";
import { NodePresentationRuntime } from "@spacexr/babylon-gltf-ext";
import { registerNodePresentationLoaders } from "@spacexr/babylon-gltf-ext/loader";

registerNodePresentationLoaders();
const runtime = new NodePresentationRuntime(scene, { ground });
```

The loader declares what a glTF says on the Babylon nodes it creates, then attaches these nodes to the runtime of the scene it loads into. A scene has one runtime at most; without one, the declarations are kept and the nodes are not moved.

`ground` is the application's `IGroundSurface`: it projects a position onto the displayed ground along the vertical of the place. The application knows its reference surface, its terrain and the exaggeration of its relief; this package does not.

## Writing

```ts
import { setNodePresentation } from "@spacexr/babylon-gltf-ext";
import { registerNodePresentationExporters } from "@spacexr/babylon-gltf-ext/exporter";

registerNodePresentationExporters();
setNodePresentation(node, { groundReference: { offset: 0 } });
```

The exporter writes the declaration of each node into its glTF node when the scene is exported with `GLTF2Export`. An application that holds its own copy of Babylon.js passes its `GLTFExporter` to `registerNodePresentationExporters`.

## Modules

| Export                                                  | Role                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `setNodePresentation`, `getNodePresentation`            | Declaration of a node: `groundReference`                               |
| `NodePresentationRuntime`                               | Applies the declarations of attached nodes, before each camera renders |
| `IGroundSurface`                                        | The ground of a scene, supplied by the application                     |
| `parseSpaceXrGroundReference`                           | Reader of the extension object; it throws on a malformed property      |
| `registerNodePresentationLoaders` (entry `/loader`)     | Registers the loader of the node extension                             |
| `registerNodePresentationExporters` (entry `/exporter`) | Registers the exporter of the node extension                           |

## Behaviour

- The origin of the node is moved to the point its `IGroundSurface` returns, read again every 30 frames by default (`groundRefreshFrames`). Where no ground is known, the node keeps its authored position.
- Only the position of the node changes. Its rotation, its scale and what stands below it are left to whatever else presents it: a `SPACEXR_label` on the same node reads where the node stands, when this runtime is created before the label runtime.
- A node that is disabled is left alone; a node that is detached gets its authored position back.
