// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';
const util = require('./util');

// NOTE: r_water, r_ocean, other fields are boolean valued so it
// could be more efficient to pack them as bit fields in Uint8Array


/* a region is water if the noise value is low */
exports.assign_r_water = function(mesh, noise, params) {
    let r_water = new Array(mesh.numRegions);
    r_water.fill(false);
    for (let r = 0; r < mesh.numRegions; r++) {
        if (mesh.r_ghost(r) || mesh.r_boundary(r)) {
            r_water[r] = true;
        } else {
            let nx = (mesh.r_vertex[r][0] - 500) / 500;
            let ny = (mesh.r_vertex[r][1] - 500) / 500;
            let distance_squared = nx*nx + ny*ny;
            let n = util.mix(util.fbm_noise(noise, nx, ny), 0.5, params.round);
            r_water[r] = n - (1.0 - params.inflate) * distance_squared < 0;
        }
    }
    return r_water;
};


/* a region is ocean if it is a water region connected to the ghost region,
   which is outside the boundary of the map; this could be any seed set but
   for islands, the ghost region is a good seed */
exports.assign_r_ocean = function(mesh, r_water) {
    let r_ocean = new Array(mesh.numRegions);
    r_ocean.fill(false);
    let stack = [mesh.ghost_r()];
    let r_out = [];
    while (stack.length > 0) {
        let r1 = stack.pop();
        mesh.r_circulate_r(r_out, r1);
        for (let r2 of r_out) {
            if (r_water[r2] && !r_ocean[r2]) {
                r_ocean[r2] = true;
                stack.push(r2);
            }
        }
    }
    return r_ocean;
};
