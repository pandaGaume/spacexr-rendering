// Uniforms of the rock when the material does not use a uniform buffer. With one, the plugin declares the same names
// in the buffer of the material. Every value is a vec4: see rock-uniforms.ts for the meaning of each component.
#ifdef ROCKMATERIAL
uniform vec4 rockPalette0;
uniform vec4 rockPalette1;
uniform vec4 rockPalette2;
uniform vec4 rockPalette3;
uniform vec4 rockPalette4;
uniform vec4 rockParams;
uniform vec4 rockSeed;
uniform vec4 rockSurface;
uniform vec4 rockMacro;
uniform vec4 rockStrata;
uniform vec4 rockStrataNormal;
uniform vec4 rockFracture;
uniform vec4 rockJointB;
uniform vec4 rockJointC;
uniform vec4 rockMeso;
uniform vec4 rockFacet;
uniform vec4 rockCrack;
uniform vec4 rockMesoRotation0;
uniform vec4 rockMesoRotation1;
uniform vec4 rockMesoRotation2;
uniform vec4 rockMicro;
uniform vec4 rockDetail;
#endif
