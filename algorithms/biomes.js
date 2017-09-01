// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

function biome(ocean, water, coast, elevation, moisture) {
    if (ocean) {
        return 'OCEAN';
    } else if (water) {
        if (elevation < 0.1) return 'MARSH';
        if (elevation > 0.8) return 'ICE';
        return 'LAKE';
    } else if (coast) {
        return 'BEACH';
    } else if (elevation > 0.8) {
        if (moisture > 0.50) return 'SNOW';
        else if (moisture > 0.33) return 'TUNDRA';
        else if (moisture > 0.16) return 'BARE';
        else return 'SCORCHED';
    } else if (elevation > 0.6) {
        if (moisture > 0.66) return 'TAIGA';
        else if (moisture > 0.33) return 'SHRUBLAND';
        else return 'TEMPERATE_DESERT';
    } else if (elevation > 0.3) {
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

exports.assign_r_biome = function(mesh, r_ocean, r_water, r_elevation, r_moisture, temperatureBias, moistureBias) {
    let r_biome = new Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        r_biome[r] = biome(r_ocean[r], r_water[r], false /* TODO: */, r_elevation[r] - temperatureBias, r_moisture[r] + moistureBias);
    }
    return r_biome;
};
