#ifdef ROCKMATERIAL
// Mesh-local position, in metres: the rock is a solid texture of this position.
varying vec3 vRockPosition;
#ifdef ROCKDETAILNORMAL
// Mesh-local normal, for the triplanar weights of the optional detail normal map.
varying vec3 vRockNormal;
#endif
#endif
