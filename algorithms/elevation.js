// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';
const TriangleMesh = require('@redblobgames/triangle-mesh');

exports.find_coasts_t = function(mesh, v_ocean) {
    let coasts_t = [];
    for (let e = 0; e < mesh.numEdges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        let t = TriangleMesh.e_to_t(e);
        if (v_ocean[v0] && !v_ocean[v1]) {
            // It might seem that we also need to check !v_ocean[v0] && v_ocean[v1]
            // and it might seem that we have to add both t and its opposite but
            // each t vertex shows up in *four* half edges, so we only have to test
            // one fourth of those conditions to get the vertex in the list once.
            coasts_t.push(t);
        }
    }
    return coasts_t;
};

exports.assign_t_elevation = function(mesh, v_ocean, v_water) {
    const t_ocean = (t) => v_ocean[mesh.e_begin_v(3*t)];
    let out_t = [];
    let queue_t = exports.find_coasts_t(mesh, v_ocean);
    let t_distance = new Array(mesh.numTriangles);
    t_distance.fill(null);
    let minDistance = 1, maxDistance = 1;
    queue_t.forEach((t) => { t_distance[t] = 0; });
    while (queue_t.length > 0) {
        let current_t = queue_t.shift();
        mesh.t_circulate_t(out_t, current_t);
        for (let neighbor_t of out_t) {
            if (t_distance[neighbor_t] === null) {
                let newDistance = 1 + t_distance[current_t];
                t_distance[neighbor_t] = newDistance;
                if (t_ocean(neighbor_t) && newDistance > minDistance) { minDistance = newDistance; }
                if (!t_ocean(neighbor_t) && newDistance > maxDistance) { maxDistance = newDistance; }
                queue_t.push(neighbor_t);
            }
        }
    }

    let t_elevation = t_distance.map((d, t) => t_ocean(t) ? (-d / minDistance) : (d / maxDistance));
    return {t_distance, t_elevation};
};

/** v elevation is the MIN of the t elevations;
 * average and max would work too */
exports.assign_v_elevation = function(mesh, t_elevation, v_ocean) {
    let out_t = [];
    let v_elevation = new Array(mesh.numVertices);
    for (let v = 0; v < mesh.numVertices; v++) {
        mesh.v_circulate_t(out_t, v);
        let elevation = Infinity;
        for (let t of out_t) {
            if (t_elevation[t] < elevation) { elevation = t_elevation[t]; }
        }
        elevation = 0;
        for (let t of out_t) {
            elevation += t_elevation[t];
        }
        v_elevation[v] = elevation/out_t.length;
    }
    return v_elevation;
};
