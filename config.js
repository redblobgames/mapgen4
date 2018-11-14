/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Configuration parameters shared by the point precomputation and the
 * map generator. Some of these objects are empty because they will be
 * filled in by the map generator.
 */

const config = {
    spacing: 5,
    mountainSpacing: 35,
    mountainDensity: 1500,
    mesh: {
        seed: 12345,
    },
    elevation: {
    },
    biomes: {
    },
    rivers: {
    },
    render: {
    },
};

module.exports = config;
