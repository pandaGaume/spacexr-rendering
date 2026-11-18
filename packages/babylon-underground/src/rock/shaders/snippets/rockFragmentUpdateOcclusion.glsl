// After the ambient occlusion and reflectivity blocks of the PBR material: the cavity of the rock occludes.
#ifdef ROCKMATERIAL
aoOut.ambientOcclusionColor *= rockOcclusion;
#endif
