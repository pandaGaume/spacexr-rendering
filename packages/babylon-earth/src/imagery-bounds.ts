import type { ITileAddress } from "@spacexr/tiles";

/**
 * Geographic extent in degrees. `west` greater than `east` crosses the antimeridian. Latitudes beyond the Web
 * Mercator coverage are clamped by the tiles themselves.
 */
export interface IGeographicBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

/** Latitude in degrees of the northern edge of a Web Mercator tile row. */
function rowLatitude(y: number, lod: number): number {
    return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** lod))) * 180) / Math.PI;
}

/** Extent of a Web Mercator tile, in degrees. */
export function webMercatorTileBounds(address: ITileAddress): IGeographicBounds {
    const count = 2 ** address.lod;
    return {
        west: (address.x / count) * 360 - 180,
        east: ((address.x + 1) / count) * 360 - 180,
        north: rowLatitude(address.y, address.lod),
        south: rowLatitude(address.y + 1, address.lod),
    };
}

/** Longitude spans of an extent, split at the antimeridian. */
function longitudeSpans(bounds: IGeographicBounds): Array<readonly [number, number]> {
    let width = bounds.east - bounds.west;
    if (width < 0) width += 360;
    if (width >= 360) return [[-180, 180]];
    const west = ((((bounds.west + 180) % 360) + 360) % 360) - 180;
    const east = west + width;
    return east <= 180
        ? [[west, east]]
        : [
              [west, 180],
              [-180, east - 360],
          ];
}

/**
 * Whether a Web Mercator tile crosses or touches an extent: tiles sharing an edge with it are included, since the
 * pages of neighbouring tiles share their edge texels.
 */
export function tileTouchesBounds(address: ITileAddress, bounds: IGeographicBounds): boolean {
    const tile = webMercatorTileBounds(address);
    if (tile.south > bounds.north || tile.north < bounds.south) return false;
    return longitudeSpans(bounds).some(([west, east]) => tile.west <= east && tile.east >= west);
}
