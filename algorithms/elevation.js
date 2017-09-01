// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

/** Coast corners are connected to coast sides, which have
 * ocean on one side and land on the other
 */
exports.find_coasts_t = function(mesh, r_ocean) {
    let coasts_t = [];
    for (let s = 0; s < mesh.numSides; s++) {
        let r0 = mesh.s_begin_r(s);
        let r1 = mesh.s_end_r(s);
        let t = mesh.s_inner_t(s);
        if (r_ocean[r0] && !r_ocean[r1]) {
            // It might seem that we also need to check !r_ocean[r0] && r_ocean[r1]
            // and it might seem that we have to add both t and its opposite but
            // each t vertex shows up in *four* directed sides, so we only have to test
            // one fourth of those conditions to get the vertex in the list once.
            coasts_t.push(t);
        }
    }
    return coasts_t;
};


/** Elevation is based on breadth first search from the seed points,
 * which are the coastal graph nodes. Since breadth first search also
 * calculates the 'parent' pointers, return those for use as the downslope
 * graph. To handle lakes, which should have all corners at the same elevation,
 * there are two deviations from breadth first search:
 * 1. Instead of pushing to the end of the queue, push to the beginning.
 * 2. Like uniform cost search, check if the new distance is better than
 *    previously calculated distances. It is possible that one lake corner
 *    was reached with distance 2 and another with distance 3, and we need
 *    to revisit that node and make sure it's set to 2.
 */
exports.assign_t_elevation = function(mesh, r_ocean, r_water, randInt) {
    const t_ocean = (t) => r_ocean[mesh.s_begin_r(3*t)];
    const r_lake = (r) => r_water[r] && !r_ocean[r];
    const s_lake = (s) => r_lake(mesh.s_begin_r(s)) || r_lake(mesh.s_end_r(s));
    let out_s = [];
    let queue_t = exports.find_coasts_t(mesh, r_ocean);
    let t_distance = new Array(mesh.numTriangles);
    let t_downslope_s = new Array(mesh.numTriangles);
    t_distance.fill(null);
    t_downslope_s.fill(-1);
    let minDistance = 1, maxDistance = 1;
    queue_t.forEach((t) => { t_distance[t] = 0; });
    while (queue_t.length > 0) {
        let current_t = queue_t.shift();
        mesh.t_circulate_s(out_s, current_t);
        let iOffset = randInt(out_s.length);
        for (let i = 0; i < out_s.length; i++) {
            let s = out_s[(i + iOffset) % out_s.length];
            let lake = s_lake(s);
            let neighbor_t = mesh.s_outer_t(s);
            let newDistance = (lake? 0 : 1) + t_distance[current_t];
            if (t_distance[neighbor_t] === null || newDistance < t_distance[neighbor_t]) {
                t_downslope_s[neighbor_t] = mesh.s_opposite_s(s);
                t_distance[neighbor_t] = newDistance;
                if (t_ocean(neighbor_t) && newDistance > minDistance) { minDistance = newDistance; }
                if (!t_ocean(neighbor_t) && newDistance > maxDistance) { maxDistance = newDistance; }
                if (lake) {
                    queue_t.unshift(neighbor_t);
                } else {
                    queue_t.push(neighbor_t);
                }
            }
        }
    }

    let t_elevation = t_distance.map((d, t) => t_ocean(t) ? (-d / minDistance) : (d / maxDistance));
    return {t_distance, t_elevation, t_downslope_s};
};

/** Set r elevation to the average of the t elevations. There's a
 * corner case though: it is possible for an ocean region (r) to be
 * surrounded by coastline corners (t), and coastlines are set to 0
 * elevation. This means the region elevation would be 0. To avoid
 * this, I subtract a small amount for ocean regions. */
exports.assign_r_elevation = function(mesh, t_elevation, r_ocean) {
    const max_ocean_elevation = -0.01;
    let out_t = [];
    let r_elevation = new Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        mesh.r_circulate_t(out_t, r);
        let elevation = 0.0;
        for (let t of out_t) {
            elevation += t_elevation[t];
        }
        r_elevation[r] = elevation/out_t.length;
        if (r_ocean[r] && r_elevation[r] > max_ocean_elevation) {
            r_elevation[r] = max_ocean_elevation;
        }
    }
    return r_elevation;
};
