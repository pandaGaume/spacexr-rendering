// After the final normal of the PBR material, two-sided lighting included, and before any lighting reads it.
#ifdef ROCKMATERIAL
normalW = rockPerturbNormal(normalW);
#endif
