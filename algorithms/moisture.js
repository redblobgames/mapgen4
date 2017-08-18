// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

/**
 * Find polygons adjacent to rivers; out_v should be a Set
 */
exports.find_riverbanks_v = function(out_v, mesh, e_flow) {
    for (let e = 0; e < mesh.numSolidEdges; e++) {
        if (e_flow[e] > 0) {
            out_v.add(mesh.e_begin_v(e));
            out_v.add(mesh.e_end_v(e));
        }
    }
};


/**
 * Find lakeshores -- polygons adjacent to lakes; out_v should be a Set
 */
exports.find_lakeshores_v = function(out_v, mesh, v_ocean, v_water) {
    for (let e = 0; e < mesh.numSolidEdges; e++) {
        let v0 = mesh.e_begin_v(e),
            v1 = mesh.e_end_v(e);
        if (v_water[v0] && !v_ocean[v0]) {
            out_v.add(v0);
            out_v.add(v1);
        }
    }
};


/**
 * Find polygons that have maximum moisture; returns a Set
 */
exports.find_moisture_seeds_v = function(mesh, e_flow, v_ocean, v_water) {
    let seeds_v = new Set();
    exports.find_riverbanks_v(seeds_v, mesh, e_flow);
    exports.find_lakeshores_v(seeds_v, mesh, v_ocean, v_water);
    return seeds_v;
};


/**
 * Assign moisture level. Oceans and lakes have moisture 1.0. Land
 * polygons have moisture based on the distance to the nearest fresh
 * water. Lakeshores and riverbanks are distance 0. Moisture will be
 * 1.0 at distance 0 and go down to 0.0 at the maximum distance.
 */
exports.assign_v_moisture = function(mesh, v_water, seed_v /* Set */) {
    let out_v = [];
    let queue_v = Array.from(seed_v);
    let v_distance = new Array(mesh.numVertices);
    v_distance.fill(null);
    let maxDistance = 1;
    queue_v.forEach((v) => { v_distance[v] = 0; });
    while (queue_v.length > 0) {
        let current_v = queue_v.shift();
        mesh.v_circulate_v(out_v, current_v);
        for (let neighbor_v of out_v) {
            if (!v_water[neighbor_v] && v_distance[neighbor_v] === null) {
                let newDistance = 1 + v_distance[current_v];
                v_distance[neighbor_v] = newDistance;
                if (newDistance > maxDistance) { maxDistance = newDistance; }
                queue_v.push(neighbor_v);
            }
        }
    }

    let v_moisture = v_distance.map((d, v) => v_water[v]? 1.0 : 1.0 - Math.pow(d / maxDistance, 0.5));
    return v_moisture;
};
