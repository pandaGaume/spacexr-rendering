import { createAtmosphereLayer } from "@spacexr/atmosphere";
// O3 at 233 K, 10 nm bin averages of the Bremen reference spectra, as tabulated by
// Eric Bruneton's 2017 atmosphere demonstration. See THIRD-PARTY-NOTICES.md.
const crossSections = [
    1.18e-27, 2.182e-28, 2.818e-28, 6.636e-28, 1.527e-27, 2.763e-27, 5.52e-27, 8.451e-27, 1.582e-26, 2.316e-26, 3.669e-26, 4.924e-26,
    7.752e-26, 9.016e-26, 1.48e-25, 1.602e-25, 2.139e-25, 2.755e-25, 3.091e-25, 3.5e-25, 4.266e-25, 4.672e-25, 4.398e-25, 4.701e-25,
    5.019e-25, 4.305e-25, 3.74e-25, 3.215e-25, 2.662e-25, 2.238e-25, 1.852e-25, 1.473e-25, 1.209e-25, 9.423e-26, 7.455e-26, 6.566e-26,
    5.105e-26, 4.15e-26, 4.228e-26, 3.237e-26, 2.451e-26, 2.801e-26, 2.534e-26, 1.624e-26, 1.465e-26, 2.078e-26, 1.383e-26, 7.105e-27,
];
/** Reference Earth ozone column, 300 DU, tent profile from 10 to 40 km peaking at 25 km. */
export function earthOzoneLayer() {
    return createAtmosphereLayer({
        id: "earth-ozone",
        kind: "absorption",
        profile: {
            kind: "tent",
            bottomAltitudeMeters: 10000,
            topAltitudeMeters: 40000,
            referenceAltitudeMeters: 25000,
            scaleHeightMeters: 15000,
            densityScale: 1,
        },
        absorption: {
            numberDensityPerM3: (300 * 2.687e20) / 15000,
            crossSections: crossSections.map((cross, i) => [365 + 10 * i, cross] as const),
        },
    });
}
