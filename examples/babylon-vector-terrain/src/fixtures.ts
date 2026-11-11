import { VectorTileGeomType, type IVectorGeoLayer, type IVectorStyle } from "@spacexr/vector";
const point = (longitude: number, latitude: number) => ({ longitude, latitude });
/** Deliberately fictional geometry, for checking draping and tile boundaries without a vector service or key. */
export const layers: readonly IVectorGeoLayer[] = [
    {
        name: "traces",
        features: [
            {
                id: "demo-traverse",
                type: VectorTileGeomType.LINESTRING,
                geometry: [
                    Array.from({ length: 121 }, (_, i) => {
                        const t = i / 120;
                        return point(6.7 + t * 0.32, 45.78 + t * 0.12 + 0.009 * Math.sin(t * 8 * Math.PI));
                    }),
                ],
            },
        ],
    },
    {
        name: "zone",
        features: [
            {
                id: "demo-zone",
                type: VectorTileGeomType.POLYGON,
                geometry: [
                    [point(6.8, 45.805), point(6.91, 45.805), point(6.91, 45.86), point(6.8, 45.86)],
                    [point(6.84, 45.82), point(6.88, 45.82), point(6.88, 45.845), point(6.84, 45.845)],
                ],
            },
        ],
    },
    { name: "points", features: [{ id: "demo-points", type: VectorTileGeomType.POINT, geometry: [[point(6.83, 45.81), point(6.89, 45.85), point(6.8652, 45.8326)]] }] },
];
/** Constant paint rules, retained in order; polygon opacity is kept in each transparent RGBA tile. */
export const style: IVectorStyle = {
    layers: [
        { sourceLayer: "zone", type: "fill", color: "#ffd43b", outlineColor: "#ffe681", width: 2, opacity: 0.45 },
        { sourceLayer: "traces", type: "line", color: "#071b2e", width: 7 },
        { sourceLayer: "traces", type: "line", color: "#36e4ff", width: 4 },
        { sourceLayer: "points", type: "circle", color: "#ff58c9", outlineColor: "#ffffff", width: 2, radius: 5 },
    ],
};
