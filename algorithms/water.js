// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

const util = require('./util');

// NOTE: v_water, v_ocean, other fields are boolean valued so it
// could be more efficient to pack them as bit fields in Uint8Array


/* a polygon is water if the noise value is low */
exports.assign_v_water = function(mesh, noise, params) {
    let v_water = new Array(mesh.num_vertices);
    v_water.fill(false);
    for (let v = 0; v < mesh.num_vertices; v++) {
        if (mesh.v_ghost(v) || mesh.v_boundary(v)) {
            v_water[v] = true;
        } else {
            let dx = (mesh.vertices[v][0] - 500) / 500;
            let dy = (mesh.vertices[v][1] - 500) / 500;
            let distance_squared = dx*dx + dy*dy;
            let n = util.mix(util.fbm_noise(noise, dx, dy), 0.5, params.round);
            v_water[v] = n - (1.0 - params.inflate) * distance_squared < 0;
        }
    }
    return v_water;
};


/* a polygon is ocean if it is a water polygon connected to the ghost polygon,
   which is outside the boundary of the map; this could be any seed set but
   for islands, the ghost polygon is a good seed */
exports.assign_v_ocean = function(mesh, v_water) {
    let v_ocean = new Array(mesh.num_vertices);
    v_ocean.fill(false);
    let stack = [mesh.ghost_v()];
    let v_out = [];
    while (stack.length > 0) {
        let v1 = stack.pop();
        mesh.v_circulate_v(v_out, v1);
        for (let v2 of v_out) {
            if (v_water[v2] && !v_ocean[v2]) {
                v_ocean[v2] = true;
                stack.push(v2);
            }
        }
    }
    return v_ocean;
};
