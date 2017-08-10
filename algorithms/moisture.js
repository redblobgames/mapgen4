// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

/**
 * Find polygons adjacent to rivers
 */
exports.find_riverbanks_v = function(mesh, e_flow) {
    let riverbanks_v = new Set();
    for (let e = 0; e < mesh.numEdges; e++) {
        if (e_flow[e] > 0) {
            riverbanks_v.add(mesh.e_begin_v(e));
            riverbanks_v.add(mesh.e_end_v(e));
        }
    }
    return riverbanks_v;
}

exports.assign_v_moisture = function(mesh, v_ocean, v_water, seed_v) {
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
            if (v_distance[neighbor_v] === null) {
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
