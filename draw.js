/*
 * From http://www.redblobgames.com/maps/mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

import * as Biome from "./biome.js";

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function lerp(a, b, t) { return a * (1-t) + b * t; }

export function background(ctx, _colormap) {
    ctx.fillStyle = "purple";
    ctx.fillRect(0, 0, 1000, 1000);
};


export function noisyRegions(ctx, map, colormap, noisyEdge) {
    let {mesh} = map;
    let s_out = [];

    for (let r = 0; r < mesh.numSolidRegions; r++) {
        mesh.s_around_r(r, s_out);
        let last_t = mesh.t_inner_s(s_out[0]);
        ctx.fillStyle = ctx.strokeStyle = colormap.biome(map, r);
        ctx.beginPath();
        ctx.moveTo(mesh.x_of_t(last_t), mesh.y_of_t(last_t));
        for (let s of s_out) {
            if (!noisyEdge || !colormap.side(map, s).noisy) {
                let first_t = mesh.t_outer_s(s);
                ctx.lineTo(mesh.x_of_t(first_t), mesh.y_of_t(first_t));
            } else {
                for (let p of map.lines_s[s]) {
                    ctx.lineTo(p[0], p[1]);
                }
            }
        }
        ctx.fill();
    }
};

/*
 * Helper function: how big is the region?
 *
 * Returns the minimum distance from the region center to a corner
 */
function region_radius(mesh, r) {
    let rx = mesh.x_of_r(r), ry = mesh.y_of_r(r);
    let min_distance_squared = Infinity;
    let t_out = [];
    mesh.t_around_r(r, t_out);
    for (let t of t_out) {
        let tx = mesh.x_of_t(t), ty = mesh.y_of_t(t);
        let dx = rx - tx, dy = ry - ty;
        let distance_squared = dx*dx + dy*dy;
        if (distance_squared < min_distance_squared) {
            min_distance_squared = distance_squared;
        }
    }
    return Math.sqrt(min_distance_squared);
}

/*
 * Draw a biome icon in each of the regions
 */
export function regionIcons(ctx, map, mapIconsConfig, randInt) {
    let {mesh} = map;
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        if (mesh.is_boundary_r(r)) { continue; }
        // The mapgen2 and mapgen4 elevations and moisture levels don't match up,
        // so I had to tweak this a bit to make the biome() function look ok
        let biome = Biome.biome(map.elevation_r[r] < 0.0, map.elevation_r[r] < 0.0,
            false, (1.0 - map.elevation_r[r]) ** 2, map.rainfall_r[r] ** 3);
        let radius = region_radius(mesh, r);
        let row = {
            OCEAN: 0, LAKE: 0,
            SHRUBLAND: 2,
            TEMPERATE_DESERT: 3, SUBTROPICAL_DESERT: 3,
            TROPICAL_RAIN_FOREST: 4, TROPICAL_SEASONAL_FOREST: 4,
            TEMPERATE_DECIDUOUS_FOREST: 5, TEMPERATE_RAIN_FOREST: 5,
            GRASSLAND: 6,
            MARSH: 7,
            TAIGA: 9,
        }[biome];
        // NOTE: mountains reflect elevation, but the biome
        // calculation reflects temperature, so if you set the biome
        // bias to be 'cold', you'll get more snow, but you shouldn't
        // get more mountains, so the mountains are calculated
        // separately from biomes
        if (row === 5 && mesh.y_of_r(r) < 300) { row = 9; }
        if (map.elevation_r[r] > 0.3) { row = 1; }
        if (row === undefined) { continue; }
        let col = 1 + randInt(5);
        ctx.drawImage(mapIconsConfig.image,
                      mapIconsConfig.left + col*100, mapIconsConfig.top + row*100,
                      100, 100,
                      mesh.x_of_r(r) - radius, mesh.y_of_r(r) - radius,
                      2*radius, 2*radius);
    }
};


/*
 * Drawing the region polygons leaves little gaps in HTML5 Canvas
 * so I need to draw edges to fill those gaps. Sometimes those edges
 * are simple straight lines but sometimes they're thick noisy lines
 * like coastlines and rivers.
 *
 * This step is rather slow so it's split up into phases.
 *
 * If 'filter' is defined, filter(side, style) should return true if
 * the edge is to be drawn. This is used by the rivers and coastline
 * drawing functions.
 */
export function noisyEdges(ctx, map, colormap, noisyEdge, phase /* 0-15 */, filter=null) {
    let {mesh} = map;
    let begin = (mesh.numSolidSides/16 * phase) | 0;
    let end = (mesh.numSolidSides/16 * (phase+1)) | 0;
    for (let s = begin; s < end; s++) {
        let style = colormap.side(map, s);
        if (filter && !filter(s, style)) { continue; }
        ctx.strokeStyle = style.strokeStyle;
        ctx.lineWidth = style.lineWidth;
        let last_t = mesh.t_inner_s(s);
        ctx.beginPath();
        ctx.moveTo(mesh.x_of_t(last_t), mesh.y_of_t(last_t));
        if (!noisyEdge || !style.noisy) {
            let first_t = mesh.t_outer_s(s);
            ctx.lineTo(mesh.x_of_t(first_t), mesh.y_of_t(first_t));
        } else {
            for (let p of map.lines_s[s]) {
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.stroke();
    }
};


export function vertices(ctx, map) {
    let {mesh} = map;
    ctx.fillStyle = "black";
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        ctx.beginPath();
        ctx.arc(mesh.x_of_r(r), mesh.y_of_r(r), 2, 0, 2*Math.PI);
        ctx.fill();
    }
};


export function rivers(ctx, map, colormap, noisyEdge, fast) {
    if (!fast) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    for (let phase = 0; phase < 16; phase++) {
        noisyEdges(ctx, map, colormap, noisyEdge, phase,
            (s, style) => colormap.draw_river_s(map, s));
    }
};


export function coastlines(ctx, map, colormap, noisyEdge) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let phase = 0; phase < 16; phase++) {
        noisyEdges(ctx, map, colormap, noisyEdge, phase,
            (s, style) => colormap.draw_coast_s(map, s));
    }
};
