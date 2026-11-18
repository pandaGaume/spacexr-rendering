// Inside the reflectivity block of the PBR material, metallic workflow: the rock sets the roughness.
#ifdef ROCKMATERIAL
metallicRoughness.g = rockRoughness;
#endif
