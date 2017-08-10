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


exports.next_river_t = function(mesh, river_t, t_elevation) {
    // Pick a random point that's not already in river_t and not in the ocean
    for (let tries = 0; tries < 100; tries++) {
        let t = Math.floor(mesh.numSolidTriangles * Math.random());
        if (t_elevation[t] > 0.0 && river_t.indexOf(t) < 0) {
            return t;
        }
    }
    throw "could not find a new river";
}

exports.assign_e_flow = function(mesh, t_downslope_e, river_t) {
    // Each river in river_t contributes 1 flow down to the coastline
    let e_flow = new Array(mesh.numEdges);
    e_flow.fill(0);
    for (let t of river_t) {
        for (;;) {
            let e = t_downslope_e[t];
            if (e === -1) { break; }
            e_flow[e]++;
            let next_t = TriangleMesh.e_to_t(mesh.opposites[e]);
            if (next_t === t) { break; }
            t = next_t;
        }
    }
    return e_flow;
};
