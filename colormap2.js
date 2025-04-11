/*
 * From http://www.redblobgames.com/maps/mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

export const discreteColors = {
    OCEAN: "#44447a",
    COAST: "#33335a",
    LAKESHORE: "#225588",
    LAKE: "#336699",
    RIVER: "#225588",
    MARSH: "#2f6666",
    ICE: "#99ffff",
    BEACH: "#a09077",
    SNOW: "#ffffff",
    TUNDRA: "#bbbbaa",
    BARE: "#888888",
    SCORCHED: "#555555",
    TAIGA: "#99aa77",
    SHRUBLAND: "#889977",
    TEMPERATE_DESERT: "#c9d29b",
    TEMPERATE_RAIN_FOREST: "#448855",
    TEMPERATE_DECIDUOUS_FOREST: "#679459",
    GRASSLAND: "#88aa55",
    SUBTROPICAL_DESERT: "#d2b98b",
    TROPICAL_RAIN_FOREST: "#337755",
    TROPICAL_SEASONAL_FOREST: "#559944",
};

function smoothColoring(e, t, m) {
    // adapted from <https://www.redblobgames.com/maps/terrain-from-noise/>
    if (e < 0.0) {
        return `rgb(${(48 + 48*e) | 0}, ${(64 + 64*e) | 0}, ${(127 + 128*e) | 0})`;
    }

    // Green or brown at low elevation, and make it more white-ish
    // as you get colder
    m = m * (1-e); // higher elevation holds less moisture; TODO: should be based on slope, not elevation
    let r = 210 - 100*m;
    let g = 185 - 45*m;
    let b = 139 - 45*m;
    /* darken to make particles easier to see */
    r *= 0.8;
    g *= 0.8;
    b *= 0.8;
    r = 255 * e + r * (1-e);
    g = 255 * e + g * (1-e);
    b = 255 * e + b * (1-e);
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}


class Coloring {
    constructor() {
    }

    draw_coast_s(map, s) {
        const r0 = map.mesh.r_begin_s(s),
              r1 = map.mesh.r_end_s(s);
        const water_at_r0 = map.elevation_r[r0] < 0.0,
              water_at_r1 = map.elevation_r[r1] < 0.0;
        return water_at_r0 !== water_at_r1;
    }

    draw_lakeside_s(map, s) {
        return this.draw_coast_s(map, s);
    }

    draw_river_s(map, s) {
        const MIN_FLOW = Math.exp(this.riversParam.lg_min_flow);
        let r0 = map.mesh.r_begin_s(s),
            r1 = map.mesh.r_end_s(s);
        const water_at_r0 = map.elevation_r[r0] < 0.0,
              water_at_r1 = map.elevation_r[r1] < 0.0;
        return ((map.flow_s[s] >= MIN_FLOW || map.flow_s[map.mesh.s_opposite_s(s)] >= MIN_FLOW)
            && !water_at_r0 && !water_at_r1);
    }

    biome(map, r) {
        return "red";
    }

    side(map, s) {
        let r0 = map.mesh.r_begin_s(s),
            r1 = map.mesh.r_end_s(s);
        if (this.draw_coast_s(map, s)) {
            // Coastlines are thick
            return {
                noisy: true,
                lineWidth: 3,
                strokeStyle: discreteColors.COAST,
            };
        } else if (this.draw_lakeside_s(map, s)) {
            // Lake boundary
            return {
                noisy: true,
                lineWidth: 1.5,
                strokeStyle: discreteColors.LAKESHORE,
            };
        } else if (this.draw_river_s(map, s)) {
            // River
            const MIN_FLOW = Math.exp(this.riversParam.lg_min_flow);
            const RIVER_WIDTH = Math.exp(this.riversParam.lg_river_width);
            return {
                noisy: true,
                lineWidth: 2.0 * Math.sqrt(map.flow_s[s] - MIN_FLOW) * this.spacingParam / 2 * RIVER_WIDTH,
                strokeStyle: discreteColors.RIVER,
            };
        } else {
            return {
                noisy: true,
                lineWidth: 1.0,
                strokeStyle: this.biome(map, r0),
            };
        }
    }
}

export class Discrete extends Coloring {
    biome(map, r) {
        return discreteColors[map.biome_r[r]];
    }
}

export class Smooth extends Coloring {
    biome(map, r) {
        return smoothColoring(
            map.elevation_r[r],
            Math.min(1, Math.max(0, 1.0 - map.elevation_r[r])),
            Math.min(1, Math.max(0, map.rainfall_r[r]))
        );
    }
}
