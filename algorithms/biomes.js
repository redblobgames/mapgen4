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

exports.assign_v_biome = function(mesh, v_ocean, v_water, v_elevation, v_moisture) {
    let v_biome = new Array(mesh.numVertices);
    for (let v = 0; v < mesh.numVertices; v++) {
        v_biome[v] = biome(v_ocean[v], v_water[v], false /* TODO: */, v_elevation[v], v_moisture[v]);
    }
    return v_biome;
};
