import { registerGLTFExtension, unregisterGLTFExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js";

import { EXT_INSTANCE_FEATURES, EXT_instance_features } from "./ext-instance-features";
import { EXT_MESH_FEATURES, EXT_mesh_features } from "./ext-mesh-features";
import { EXT_STRUCTURAL_METADATA, EXT_structural_metadata } from "./ext-structural-metadata";

export { EXT_INSTANCE_FEATURES, EXT_instance_features } from "./ext-instance-features";
export { EXT_MESH_FEATURES, EXT_mesh_features, loadDefaultVertexData } from "./ext-mesh-features";
export { EXT_STRUCTURAL_METADATA, EXT_structural_metadata } from "./ext-structural-metadata";

// The glTF extensions 3D Tiles 1.1 carries the identity and the metadata of features with. The loader of Babylon.js
// does not read them; these loaders do. They are an entry of their own: an application that renders no glTF content
// does not need the loaders of Babylon.js.

/** Registers the loader of `EXT_mesh_features` with the glTF loader of Babylon.js. */
export function registerExtMeshFeaturesLoader(): void {
    unregisterGLTFExtension(EXT_MESH_FEATURES);
    registerGLTFExtension(EXT_MESH_FEATURES, true, (loader) => new EXT_mesh_features(loader));
}

/** Registers the loader of `EXT_instance_features` with the glTF loader of Babylon.js. */
export function registerExtInstanceFeaturesLoader(): void {
    unregisterGLTFExtension(EXT_INSTANCE_FEATURES);
    registerGLTFExtension(EXT_INSTANCE_FEATURES, true, (loader) => new EXT_instance_features(loader));
}

/** Registers the loader of `EXT_structural_metadata` with the glTF loader of Babylon.js. */
export function registerExtStructuralMetadataLoader(): void {
    unregisterGLTFExtension(EXT_STRUCTURAL_METADATA);
    registerGLTFExtension(EXT_STRUCTURAL_METADATA, true, (loader) => new EXT_structural_metadata(loader));
}

/**
 * Registers the loaders of the features of meshes and instances, and of their metadata: they work together. An
 * application calls it once, as it registers the glTF loader.
 */
export function registerFeatureMetadataLoaders(): void {
    registerExtMeshFeaturesLoader();
    registerExtInstanceFeaturesLoader();
    registerExtStructuralMetadataLoader();
}
