// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';
const TriangleMesh = require('@redblobgames/triangle-mesh');


exports.assign_t_downslope_e = function(mesh, t_elevation) {
    let t_downslope_e = new Array(mesh.numTriangles);
    let e_out = [];
    for (let t = 0; t < mesh.numTriangles; t++) {
        mesh.t_circulate_e(e_out, t);
        let lowest_e = -1;
        let bestElevation = t_elevation[t];
        for (let e of e_out) {
            if (t_elevation[TriangleMesh.e_to_t(mesh.opposites[e])] < bestElevation) {
                lowest_e = e;
            }
        }
        t_downslope_e[t] = lowest_e;
    }
    return t_downslope_e;
};


exports.assign_e_flow = function(mesh, t_downslope_e) {
    // pick random river points and follow downstream until they stop -- are there cycles??
};
