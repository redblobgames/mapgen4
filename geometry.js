/*
 * From http://www.redblobgames.com/maps/magpen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

/* Fill P:Float32Array with x,y data from mesh:TriangleMesh,
   first region points then triangle points */
exports.setMeshGeometry = function(mesh, P) {
    let {numRegions, numTriangles} = mesh;
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
};

/* Fill P:Float32Array with elevation,moisture data from mapgen4 map,
   and also I:Int32Array with indices into this array */
exports.setMapGeometry = function(map, I, P) {
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

    if (I.length !== i) { throw "wrong size"; }
    if (P.length !== p) { throw "wrong size"; }
};

/* Fill P:Float32Array with x,y data from mesh:TriangleMesh,
   numTriangle triangles, each with 3 points */
exports.setRiverGeometry = function(mesh, P) {
    let {numSolidTriangles} = mesh;
    if (P.length !== 3 * 2 * numSolidTriangles) { throw "wrong size"; }

    let p = 0;
    for (let t = 0; t < numSolidTriangles; t++) {
        let s0 = 3*t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0+1),
            r3 = mesh.s_begin_r(s0+2);
        P[p++] = mesh.r_x(r1);
        P[p++] = mesh.r_y(r1);
        P[p++] = mesh.r_x(r2);
        P[p++] = mesh.r_y(r2);
        P[p++] = mesh.r_x(r3);
        P[p++] = mesh.r_y(r3);
    }

    if (P.length !== p) { throw "wrong size"; }
};

/* Create a bitmap that will be used for texture mapping */
exports.createRiverBitmap = function() {
    const size = 8;
    let canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    let ctx = canvas.getContext('2d');
    ctx.scale(size/1024, size/1024);
    ctx.strokeStyle = "hsl(200,50%,25%)";
    ctx.lineWidth = 200;
    
    /* FORK: let's make a right triangle for now, with the hypotenuse the outflow */
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.lineTo(333, 333);
    ctx.moveTo(512, 0);
    ctx.lineTo(333, 333);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(333, 333);
    ctx.lineTo(512, 512);
    ctx.stroke();
    
    /* BEND: let's use the other right triangle */
    ctx.beginPath();
    ctx.moveTo(1024, 512);
    ctx.lineTo(691, 691);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(691, 691);
    ctx.lineTo(512, 512);
    ctx.stroke();
    
    return canvas;
};

/* Fill P:Float32Array with u,v data pointing to the river bitmap
   created in createRiverBitmap() */
exports.setRiverTextures = function(map, P) {
    let {mesh, t_downslope_s} = map;
    let {numSolidTriangles} = mesh;
    if (P.length !== 3 * 2 * numSolidTriangles) { throw "wrong size"; }

    let p = 0;
    for (let t = 0; t < numSolidTriangles; t++) {
        /* t_downslope_s[t] tells us which side is downslope, and the
         * texture is oriented so that the downslope side should be
         * from 0,1 to 1,0 */
        let s0 = 3*t;
        let out_side = t_downslope_s[t] - s0;
        let in_side1 = (out_side + 1) % 3;
        let in_side2 = (out_side + 2) % 3;
        let flow_in1 = t_downslope_s[mesh.s_outer_t(s0+in_side1)] === mesh.s_opposite_s(s0+in_side1);
        let flow_in2 = t_downslope_s[mesh.s_outer_t(s0+in_side2)] === mesh.s_opposite_s(s0+in_side2);
        if (flow_in1 && flow_in2) {
            /* FORK */
            P[p + 2*in_side1    ] = 0;
            P[p + 2*in_side1 + 1] = 0;
            P[p + 2*in_side2    ] = 0;
            P[p + 2*in_side2 + 1] = 1;
            P[p + 2*out_side    ] = 1;
            P[p + 2*out_side + 1] = 0;
        } else if (flow_in1) {
            P[p + 2*in_side1    ] = 1;
            P[p + 2*in_side1 + 1] = 0;
            P[p + 2*in_side2    ] = 1;
            P[p + 2*in_side2 + 1] = 1;
            P[p + 2*out_side    ] = 0;
            P[p + 2*out_side + 1] = 1;
        } else {
            P[p + 2*in_side1    ] = 0;
            P[p + 2*in_side1 + 1] = 1;
            P[p + 2*in_side2    ] = 1;
            P[p + 2*in_side2 + 1] = 1;
            P[p + 2*out_side    ] = 1;
            P[p + 2*out_side + 1] = 0;
        }
        p += 6;
    }

    if (P.length !== p) { throw "wrong size"; }
};
