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
 * Find lakes -- polygons with water but not ocean; out_v should be a Set
 */
exports.find_lakes_v = function(out_v, mesh, v_ocean, v_water) {
    for (let v = 0; v < mesh.numSolidVertices; v++) {
        if (v_water[v] && !v_ocean[v]) {
            out_v.add(v);
        }
    }
};


/**
 * Find polygons that have maximum moisture; returns a Set
 */
exports.find_moisture_seeds_v = function(mesh, e_flow, v_ocean, v_water) {
    let seeds_v = new Set();
    exports.find_riverbanks_v(seeds_v, mesh, e_flow);
    exports.find_lakes_v(seeds_v, mesh, v_ocean, v_water);
    return seeds_v;
};


/**
 * Find moisture -- distance from fresh water (lakes or rivers)
 */
exports.assign_v_moisture = function(mesh, v_ocean, seed_v /* Set */) {
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
            if (!v_ocean[neighbor_v] && v_distance[neighbor_v] === null) {
                let newDistance = 1 + v_distance[current_v];
                v_distance[neighbor_v] = newDistance;
                if (newDistance > maxDistance) { maxDistance = newDistance; }
                queue_v.push(neighbor_v);
            }
        }
    }

    let v_moisture = v_distance.map((d) => 1.0 - Math.pow((d||0) / maxDistance, 0.5));
    return v_moisture;
};
