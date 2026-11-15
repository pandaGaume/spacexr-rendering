import config from "./moon-config.json";

/** Settings of the Moon composition, held in `moon-config.json`: change them there, not in the code. */
export interface IMoonConfig {
    camera: {
        /** Shortest distance from the camera to the point it orbits, in metres. */
        radiusMin: number;
        /** Lowest height of the camera above the terrain, in metres. */
        altitudeMin: number;
    };
    selection: {
        /** Budgets of the runtime caches follow what the view uses, times this factor. */
        workingSetFactor: number;
    };
}

/** The settings of `moon-config.json`. */
export const MOON_CONFIG: Readonly<IMoonConfig> = config as IMoonConfig;
