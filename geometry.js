/*
 * From http://www.redblobgames.com/maps/magpen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

/* Fill P:Float32Array with x,y data from mesh:TriangleMesh,
   first region points then triangle points */
function setMeshGeometry(mesh, P) {
    let {numSolidSides, numRegions, numTriangles} = mesh;
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = mesh.r_x(r);
        P[p++] = mesh.r_y(r);
    }
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = mesh.t_x(t);
        P[p++] = mesh.t_y(t);
    }
}

/* Fill P:Float32Array with elevation,moisture data from mapgen4 map,
   and also I:Int32Array with indices into this array */
function setMapGeometry(map, I, P) {
    const V = 0.95; // reduce elevation in valleys
    let {mesh, r_water, t_downslope_s, r_elevation, t_elevation, r_moisture} = map;
    let {numSolidSides, numRegions, numTriangles} = mesh;
    if (I.length !== 3 * numSolidSides) { throw "wrong size"; }
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = r_elevation[r];
        P[p++] = r_moisture[r];
    }
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = V * t_elevation[t];
        let s0 = 3*t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0+1),
            r3 = mesh.s_begin_r(s0+2);
        P[p++] = 1/3 * (r_moisture[r1] + r_moisture[r2] + r_moisture[r3]);
    }

    let i = 0;
    for (let s = 0; s < numSolidSides; s++) {
        let r1 = mesh.s_begin_r(s),
            r2 = mesh.s_end_r(s),
            t1 = mesh.s_inner_t(s),
            t2 = mesh.s_outer_t(s);

        // Each quadrilateral is turned into two triangles, so each
        // half-edge gets turned into one. There are two ways to fold
        // a quadrilateral. This is usually a nuisance but in this
        // case it's a feature. See the explanation here
        // https://www.redblobgames.com/x/1725-procedural-elevation/#rendering
        let coast = r_water[r1] || r_water[r2];
        if (coast || mesh.s_outer_t(t_downslope_s[t1]) === t2 || mesh.s_outer_t(t_downslope_s[t2]) === t1) {
            // It's a coastal or river edge, forming a valley
            I[i++] = r1; I[i++] = numRegions+t2; I[i++] = numRegions+t1;
        } else {
            // It's a ridge
            I[i++] = r1; I[i++] = r2; I[i++] = numRegions+t1;
        }
    }
}

exports.setMeshGeometry = setMeshGeometry;
exports.setMapGeometry = setMapGeometry;
