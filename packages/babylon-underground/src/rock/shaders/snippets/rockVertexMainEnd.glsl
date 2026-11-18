#ifdef ROCKMATERIAL
vRockPosition = positionUpdated;
#ifdef ROCKDETAILNORMAL
#ifdef NORMAL
vRockNormal = normalUpdated;
#else
vRockNormal = vec3(0.0, 1.0, 0.0);
#endif
#endif
#endif
