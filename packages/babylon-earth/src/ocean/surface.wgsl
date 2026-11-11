varying vUp: vec3f;
varying vOceanUv: vec2f;
varying vOceanClip: vec4f;
var oceanMask: texture_2d<f32>;
var oceanMaskSampler: sampler;
uniform oceanForward:vec4f;
uniform oceanRight:vec4f;
uniform oceanUp:vec4f;
uniform oceanF0:f32;
uniform sunDirection:vec3f;
uniform sunColor:vec3f;
@fragment
fn main(input:FragmentInputs)->FragmentOutputs {
    let coverage=textureSampleLevel(oceanMask,oceanMaskSampler,fragmentInputs.vOceanUv,0.0).r;
    if coverage<0.5 { discard; }
    let ndc=fragmentInputs.vOceanClip.xy/fragmentInputs.vOceanClip.w;
    let ray=normalize(uniforms.oceanForward.xyz+ndc.x*uniforms.oceanRight.w*uniforms.oceanRight.xyz+ndc.y*uniforms.oceanUp.w*uniforms.oceanUp.xyz);
    let n=normalize(fragmentInputs.vUp);
    let view=-ray;
    let mu=clamp(dot(n,view),0.0,1.0);
    let f=uniforms.oceanF0+(1.0-uniforms.oceanF0)*pow(1.0-mu,5.0);
    let daylight=max(dot(n,uniforms.sunDirection),0.0);
    let halfVector=normalize(view+uniforms.sunDirection);
    let glint=20.0*pow(max(dot(n,halfVector),0.0),128.0)*daylight;
    // P1 relative-lighting approximation, not a sampled physical sky reflection.
    var surfaceColor=vec3f(0.008,0.045,0.085)*(0.08+daylight)*(1.0-f)
        +vec3f(0.12,0.20,0.30)*f*daylight+uniforms.sunColor*uniforms.oceanF0*glint;
#ifdef NATIVE_ATMOSPHERE
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
#else
    surfaceColor=clamp(surfaceColor,vec3f(0.0),vec3f(1.0));
#endif
    fragmentOutputs.color=vec4f(surfaceColor,1.0);
}
