// Inside the albedo block of the PBR material: the rock colour multiplies the albedo colour of the material.
#ifdef ROCKMATERIAL
surfaceAlbedo *= rockAlbedo;
#endif
