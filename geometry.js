/*
 * From http://www.redblobgames.com/x/1742-webgl-mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

function makeGeometry(map) {
    const V = 0.95; // reduce elevation in valleys
    let {mesh, t_elevation, r_elevation, r_moisture, r_water, t_downslope_s} = map;
    let a_position = [];
    let a_emn = [];
    for (let s = 0; s < mesh.numSolidSides; s++) {
        let r1 = mesh.s_begin_r(s),
            r2 = mesh.s_end_r(s),
            t1 = mesh.s_inner_t(s),
            t2 = mesh.s_outer_t(s);

        let noise = r_water[r1] || r_water[r2]? 0 : 1;
        
        if (!noise || mesh.s_outer_t(t_downslope_s[t1]) === t2 || mesh.s_outer_t(t_downslope_s[t2]) === t1) {
            // It's a coastal or river edge: r1, t2, t1
            a_position.push(
                [mesh.r_x(r1), mesh.r_y(r1)],
                [mesh.t_x(t2), mesh.t_y(t2)],
                [mesh.t_x(t1), mesh.t_y(t1)]
            );
            a_emn.push(
                [r_elevation[r1], r_moisture[r1], noise],
                [V*t_elevation[t2], 0.5*(r_moisture[r1]+r_moisture[r2]), 0],
                [V*t_elevation[t1], 0.5*(r_moisture[r1]+r_moisture[r2]), 0]
            );
        } else {
            // It's a ridge edge: r1, r2, t1
            a_position.push(
                [mesh.r_x(r1), mesh.r_y(r1)],
                [mesh.r_x(r2), mesh.r_y(r2)],
                [mesh.t_x(t1), mesh.t_y(t1)]
            );
            a_emn.push(
                [r_elevation[r1], r_moisture[r1], noise],
                [r_elevation[r2], r_moisture[r2], noise],
                [V*t_elevation[t1], 0.5*(r_moisture[r1]+r_moisture[r2]), 0]
            );
        }
    }
    return {a_position, a_emn};
}


exports.make = makeGeometry;
