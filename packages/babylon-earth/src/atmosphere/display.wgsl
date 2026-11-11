struct DisplayCamera { forward: vec4f, right: vec4f, up: vec4f, screen: vec4f, sun: vec4f }
@group(1) @binding(0) var<uniform> displayCamera: DisplayCamera;
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let positions = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
    return vec4f(positions[index], 0.0, 1.0);
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
    let uv = pixel.xy / displayCamera.screen.xy;
    let direction = normalize(displayCamera.forward.xyz
        + (2.0*uv.x-1.0)*displayCamera.right.w*displayCamera.right.xyz
        + (1.0-2.0*uv.y)*displayCamera.up.w*displayCamera.up.xyz);
    let segment = atmosphere_interval(atmosphere_cameraPoint(),direction);
    var radiance = vec3f(0.0);
    if segment.y>segment.x { radiance = max(vec3f(0.0), atmosphere_skyRadiance(direction)); }
    // Direct stellar disc, using the same spectral irradiance and path transmission as the sky.
    let mu = dot(direction,displayCamera.sun.xyz);
    let angle = length(cross(direction,displayCamera.sun.xyz));
    let edge = sin(displayCamera.sun.w);
    let aa = max(fwidth(angle),1e-5);
    let disc = (1.0-smoothstep(edge-aa,edge+aa,angle))*select(0.0,1.0,mu>0.0);
    let ground = atmosphere_intersect(atmosphere_cameraPoint(),direction,1.0);
    var stellarRadiance = vec3f(0.0);
    if disc>0.0 && !(ground.x>=0.0 && ground.y>0.0) {
        let uvSky = atmosphere_skyUv(direction);
        var xyz = vec3f(0.0);
        for(var group=0u;group<arrayLength(&atmosphere_spectrum);group++) {
            let band = atmosphere_spectrum[group];
            let transmission = textureSampleLevel(atmosphere_transmission,atmosphere_sampler,uvSky,i32(group),0.0).xyz;
            xyz += atmosphere_toXYZ(transmission*band.atmosphere_solar.xyz,band);
        }
        stellarRadiance = max(vec3f(0.0),atmosphere_xyzToRgb(xyz))/(4.0*atmosphere_PI*pow(sin(0.5*displayCamera.sun.w),2.0));
    }
    let skyMapped = vec3f(1.0) - exp(-radiance*displayCamera.screen.z);
    let discMapped = vec3f(1.0) - exp(-(radiance+stellarRadiance)*displayCamera.screen.z);
    // Coverage blends displayed samples. Applying it before exposure saturates the disc edge.
    let mapped = mix(skyMapped,discMapped,disc);
    let encoded = select(1.055*pow(mapped,vec3f(1.0/2.4))-vec3f(0.055),
        12.92*mapped, mapped <= vec3f(0.0031308));
    return vec4f(encoded, 1.0);
}
