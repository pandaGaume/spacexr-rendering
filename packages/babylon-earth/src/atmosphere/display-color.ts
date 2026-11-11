import { makeSpectralScene, xyzToLinearRgb, type IAtmosphere } from "@spacexr/atmosphere";
import type { IAtmosphereSkyOptions } from "@spacexr/atmosphere/webgpu";
/** Incident-continuum white point, normalized to luminance one, matching neutral scene material RGB. */
export function atmosphereWhitePoint(model: IAtmosphere, quality: IAtmosphereSkyOptions = {}): readonly number[] {
    if (quality.source === "band") return [1, 1, 1];
    const scene = makeSpectralScene(model, quality);
    const xyz = [0, 0, 0];
    for (const bin of scene.bins) for (let c = 0; c < 3; c++) xyz[c] += bin.solar * bin.xyz[c];
    return xyzToLinearRgb(xyz).map((v) => Math.max(1e-6, v / xyz[1]));
}
