// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

const TriangleMesh = require('@redblobgames/triangle-mesh');

exports.find_coasts_t = function(mesh, v_ocean) {
    let coasts_t = [];
    for (let e = 0; e < mesh.num_edges; e++) {
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
    let t_out = [];
    let queue_t = exports.find_coasts_t(mesh, v_ocean);
    let t_distance = new Array(mesh.num_triangles);
    let min_distance = 0, max_distance = 0;
    queue_t.forEach((t) => { t_distance[t] = 0; });
    while (queue_t.length > 0) {
        let current_t = queue_t.shift();
        mesh.t_circulate_t(t_out, current_t);
        for (let neighbor_t of t_out) {
            if (t_distance[neighbor_t] === undefined) {
                let new_distance = 1 + t_distance[current_t];
                t_distance[neighbor_t] = new_distance;
                if (t_ocean(neighbor_t) && new_distance > min_distance) { min_distance = new_distance; }
                if (!t_ocean(neighbor_t) && new_distance > max_distance) { max_distance = new_distance; }
                queue_t.push(neighbor_t);
            }
        }
    }

    let t_elevation = t_distance.map((d, t) => t_ocean(t) ? (-d / min_distance) : (d / max_distance));
    return t_elevation;
};

/** v elevation is the MIN of the t elevations;
 * average and max would work too */
exports.assign_v_elevation = function(mesh, t_elevation, v_ocean) {
    let t_out = [];
    let v_elevation = new Array(mesh.num_vertices);
    for (let v = 0; v < mesh.num_vertices; v++) {
        mesh.v_circulate_t(t_out, v);
        let elevation = Infinity;
        for (let t of t_out) {
            if (t_elevation[t] < elevation) { elevation = t_elevation[t]; }
        }
        elevation = 0;
        for (let t of t_out) {
            elevation += t_elevation[t];
        }
        v_elevation[v] = elevation/t_out.length;
    }
    return v_elevation;
};
