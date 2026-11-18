/** Number of tones the shader reads. Shorter palettes are padded with their last tone. */
export const ROCK_PALETTE_SLOTS = 5;

export type LinearColour = [number, number, number];

/** A palette as the shader reads it: linear colours, always five, and the number of tones in use. */
export interface IPackedRockPalette {
    count: number;
    colours: LinearColour[];
}

/** sRGB component, 0 to 1, to linear. */
export function srgbToLinear(value: number): number {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/**
 * `#rrggbb` to linear colour.
 *
 * @throws Error When the string is not a six-digit hexadecimal colour.
 */
export function hexToLinear(hex: string): LinearColour {
    const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
    if (!match) throw new Error(`"${hex}" is not a #rrggbb colour.`);
    return [
        srgbToLinear(parseInt(match[1]!, 16) / 255),
        srgbToLinear(parseInt(match[2]!, 16) / 255),
        srgbToLinear(parseInt(match[3]!, 16) / 255),
    ];
}

/**
 * Converts 3 to 5 sRGB tones to the five linear slots of the shader. Tones are interpolated in linear colour, in
 * order, so the palette is a path from the first tone to the last.
 *
 * @throws Error When the palette does not hold 3 to 5 valid colours.
 */
export function packRockPalette(palette: readonly string[]): IPackedRockPalette {
    if (palette.length < 3 || palette.length > ROCK_PALETTE_SLOTS)
        throw new Error(`A rock palette holds 3 to 5 colours, got ${palette.length}.`);
    const colours = palette.map(hexToLinear);
    while (colours.length < ROCK_PALETTE_SLOTS) colours.push([...colours[colours.length - 1]!]);
    return { count: palette.length, colours };
}

/** Relative luminance, Rec. 709, of a linear colour. */
export function linearLuminance(colour: LinearColour): number {
    return 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
}

/** HSV saturation of a colour, 0 for a grey. */
export function saturation(colour: LinearColour): number {
    const max = Math.max(...colour);
    return max <= 0 ? 0 : (max - Math.min(...colour)) / max;
}
