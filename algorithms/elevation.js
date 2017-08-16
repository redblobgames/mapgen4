// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

/** Coast corners are connected to coast edges, which have
 * ocean on one side and land on the other
 */
exports.find_coasts_t = function(mesh, v_ocean) {
    let coasts_t = [];
    for (let e = 0; e < mesh.numEdges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        let t = mesh.e_inner_t(e);
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


/** Elevation is based on breadth first search from the seed points,
 * which are the coastal graph nodes. Since breadth first search also
 * calculates the 'parent' pointers, return those for use as the downslope
 * graph.
 */
exports.assign_t_elevation = function(mesh, v_ocean, v_water) {
    const t_ocean = (t) => v_ocean[mesh.e_begin_v(3*t)];
    let out_e = [];
    let queue_t = exports.find_coasts_t(mesh, v_ocean);
    let t_distance = new Array(mesh.numTriangles);
    let t_downslope_e = new Array(mesh.numTriangles);
    t_distance.fill(null);
    t_downslope_e.fill(-1);
    let minDistance = 1, maxDistance = 1;
    queue_t.forEach((t) => { t_distance[t] = 0; });
    while (queue_t.length > 0) {
        let current_t = queue_t.shift();
        mesh.t_circulate_e(out_e, current_t);
        for (let e of out_e) {
            let neighbor_t = mesh.e_outer_t(e);
            if (t_distance[neighbor_t] === null) {
                let newDistance = 1 + t_distance[current_t];
                t_downslope_e[neighbor_t] = mesh.opposites[e];
                t_distance[neighbor_t] = newDistance;
                if (t_ocean(neighbor_t) && newDistance > minDistance) { minDistance = newDistance; }
                if (!t_ocean(neighbor_t) && newDistance > maxDistance) { maxDistance = newDistance; }
                queue_t.push(neighbor_t);
            }
        }
    }

    let t_elevation = t_distance.map((d, t) => t_ocean(t) ? (-d / minDistance) : (d / maxDistance));
    return {t_distance, t_elevation, t_downslope_e};
};

/** Set v elevation to the average of the t elevations. There's a
 * corner case though: it is possible for an ocean polygon (v) to be
 * surrounded by coastline corners (t), and coastlines are set to 0
 * elevation. This means the polygon elevation would be 0. To avoid
 * this, I subtract a small amount for ocean polygons. */
exports.assign_v_elevation = function(mesh, t_elevation, v_ocean) {
    const max_ocean_elevation = -0.01;
    let out_t = [];
    let v_elevation = new Array(mesh.numVertices);
    for (let v = 0; v < mesh.numVertices; v++) {
        mesh.v_circulate_t(out_t, v);
        let elevation = 0.0;
        for (let t of out_t) {
            elevation += t_elevation[t];
        }
        v_elevation[v] = elevation/out_t.length;
        if (v_ocean[v] && v_elevation[v] > max_ocean_elevation) {
            v_elevation[v] = max_ocean_elevation;
        }
    }
    return v_elevation;
};
