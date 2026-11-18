// Noise functions of the rock. Integer hashes only: no sine hash, whose precision depends on the GPU.
#ifdef ROCKMATERIAL

// Integer hash pcg3d, Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 2020.
uvec3 rockPcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

// Three values in [0, 1) for an integer lattice cell. Cells are offset to stay positive before the unsigned conversion.
vec3 rockHash3(ivec3 cell, uint salt) {
    uvec3 key = uvec3(cell + ivec3(1048576)) ^ uvec3(salt, salt * 40503u, salt * 34283u);
    return vec3(rockPcg3d(key)) * (1.0 / 4294967296.0);
}

float rockHash1(int index, uint salt) {
    return float(rockPcg3d(uvec3(uint(index + 1048576), salt, 9547u)).x) * (1.0 / 4294967296.0);
}

// Value noise in [-1, 1] with its analytic gradient: x = value, yzw = gradient with respect to the argument.
// Quintic interpolation, so the gradient is continuous across cells.
vec4 rockValueNoise(vec3 x, uint salt) {
    vec3 base = floor(x);
    vec3 f = x - base;
    ivec3 c = ivec3(base);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = rockHash3(c, salt).x * 2.0 - 1.0;
    float b = rockHash3(c + ivec3(1, 0, 0), salt).x * 2.0 - 1.0;
    float d = rockHash3(c + ivec3(0, 1, 0), salt).x * 2.0 - 1.0;
    float e = rockHash3(c + ivec3(1, 1, 0), salt).x * 2.0 - 1.0;
    float g = rockHash3(c + ivec3(0, 0, 1), salt).x * 2.0 - 1.0;
    float h = rockHash3(c + ivec3(1, 0, 1), salt).x * 2.0 - 1.0;
    float i = rockHash3(c + ivec3(0, 1, 1), salt).x * 2.0 - 1.0;
    float j = rockHash3(c + ivec3(1, 1, 1), salt).x * 2.0 - 1.0;
    float k1 = b - a;
    float k2 = d - a;
    float k3 = g - a;
    float k4 = a - b - d + e;
    float k5 = a - d - g + i;
    float k6 = a - b - g + h;
    float k7 = -a + b + d - e + g - h - i + j;
    float value = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
    vec3 gradient = du * vec3(
        k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
        k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
        k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
    return vec4(value, gradient);
}

// Voronoi of jittered points: distance to the nearest cell edge, in cell units, its gradient, a hash of the cell, and a
// hash of that edge, the same from both of its cells.
struct RockVoronoi {
    float edge;
    vec3 edgeGradient;
    vec3 cellHash;
    float edgeHash;
};

// Two passes over the 27 neighbouring cells, as in Quilez's "Voronoi edges": the nearest point first, then the distance
// to each bisector plane. The points stay in the middle 70 % of their cell, so the 3 x 3 x 3 search finds them.
RockVoronoi rockVoronoi(vec3 x, uint salt) {
    vec3 base = floor(x);
    vec3 f = x - base;
    ivec3 c = ivec3(base);
    vec3 points[27];
    float nearestDistance = 1e9;
    int nearestIndex = 0;
    for (int k = 0; k < 27; k++) {
        ivec3 o = ivec3(k % 3, (k / 3) % 3, k / 9) - 1;
        vec3 r = vec3(o) + 0.15 + 0.7 * rockHash3(c + o, salt) - f;
        points[k] = r;
        float d = dot(r, r);
        if (d < nearestDistance) {
            nearestDistance = d;
            nearestIndex = k;
        }
    }
    vec3 nearest = points[nearestIndex];
    float edge = 1e9;
    vec3 edgeNormal = vec3(0.0, 0.0, 1.0);
    int edgeIndex = 0;
    for (int k = 0; k < 27; k++) {
        if (k == nearestIndex) continue;
        vec3 delta = points[k] - nearest;
        float length2 = dot(delta, delta);
        if (length2 < 1e-8) continue;
        vec3 n = delta * inversesqrt(length2);
        float d = dot(0.5 * (nearest + points[k]), n);
        if (d < edge) {
            edge = d;
            edgeNormal = n;
            edgeIndex = k;
        }
    }
    ivec3 o = ivec3(nearestIndex % 3, (nearestIndex / 3) % 3, nearestIndex / 9) - 1;
    RockVoronoi v;
    v.edge = max(edge, 0.0);
    // The bisector distance decreases when the point moves towards the edge normal.
    v.edgeGradient = -edgeNormal;
    v.cellHash = rockHash3(c + o, salt ^ 23497u);
    ivec3 e = ivec3(edgeIndex % 3, (edgeIndex / 3) % 3, edgeIndex / 9) - 1;
    v.edgeHash = rockHash3(2 * c + o + e, salt ^ 51749u).x;
    return v;
}

#endif
