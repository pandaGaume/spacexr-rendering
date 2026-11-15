import config from "./mars-config.json";

/** Settings of the Mars composition, held in `mars-config.json`: change them there, not in the code. */
export interface IMarsConfig {
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

/** The settings of `mars-config.json`. */
export const MARS_CONFIG: Readonly<IMarsConfig> = config as IMarsConfig;
