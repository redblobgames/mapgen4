/*
 * From http://www.redblobgames.com/maps/mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

export function biome(ocean, water, coast, temperature, moisture) {
    if (ocean) {
        return 'OCEAN';
    } else if (water) {
        if (temperature > 0.9) return 'MARSH';
        if (temperature < 0.2) return 'ICE';
        return 'LAKE';
    } else if (coast) {
        return 'BEACH';
    } else if (temperature < 0.2) {
        if (moisture > 0.50) return 'SNOW';
        else if (moisture > 0.33) return 'TUNDRA';
        else if (moisture > 0.16) return 'BARE';
        else return 'SCORCHED';
    } else if (temperature < 0.4) {
        if (moisture > 0.66) return 'TAIGA';
        else if (moisture > 0.33) return 'SHRUBLAND';
        else return 'TEMPERATE_DESERT';
    } else if (temperature < 0.7) {
        if (moisture > 0.83) return 'TEMPERATE_RAIN_FOREST';
        else if (moisture > 0.50) return 'TEMPERATE_DECIDUOUS_FOREST';
        else if (moisture > 0.16) return 'GRASSLAND';
        else return 'TEMPERATE_DESERT';
    } else {
        if (moisture > 0.66) return 'TROPICAL_RAIN_FOREST';
        else if (moisture > 0.33) return 'TROPICAL_SEASONAL_FOREST';
        else if (moisture > 0.16) return 'GRASSLAND';
        else return 'SUBTROPICAL_DESERT';
    }
}
