/*
 * From http://www.redblobgames.com/maps/magpen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

let {vec2} = require('gl-matrix');

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
    // TODO: V should probably depend on the slope, or elevation, or maybe it should be 0.95 in mountainous areas and 0.99 elsewhere
    const V = 0.95; // reduce elevation in valleys
    let {mesh, r_water, s_flow, r_elevation, t_elevation, r_moisture} = map;
    let {numSolidSides, numRegions, numTriangles} = mesh;

    if (I.length !== 3 * numSolidSides) { throw "wrong size"; }
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    console.time('   setMapGeometry A');
    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = r_elevation[r];
        P[p++] = r_moisture[r];
    }
    console.timeEnd('   setMapGeometry A');
    console.time('   setMapGeometry B');
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = V * t_elevation[t];
        let s0 = 3*t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0+1),
            r3 = mesh.s_begin_r(s0+2);
        P[p++] = 1/3 * (r_moisture[r1] + r_moisture[r2] + r_moisture[r3]);
    }
    console.timeEnd('   setMapGeometry B');

    console.time('   setMapGeometry C');
    let i = 0, count_valley = 0, count_ridge = 0;
    let {_halfedges, _triangles} = mesh;
    for (let s = 0; s < numSolidSides; s++) {
        let opposite_s = mesh.s_opposite_s(s),
            r1 = mesh.s_begin_r(s),
            r2 = mesh.s_begin_r(opposite_s),
            t1 = mesh.s_inner_t(s),
            t2 = mesh.s_inner_t(opposite_s);
        
        // Each quadrilateral is turned into two triangles, so each
        // half-edge gets turned into one. There are two ways to fold
        // a quadrilateral. This is usually a nuisance but in this
        // case it's a feature. See the explanation here
        // https://www.redblobgames.com/x/1725-procedural-elevation/#rendering
        let coast = r_water[r1] || r_water[r2];
        if (coast || s_flow[s] > 0 || s_flow[opposite_s] > 0) {
            // It's a coastal or river edge, forming a valley
            I[i++] = r1; I[i++] = numRegions+t2; I[i++] = numRegions+t1;
            count_valley++;
        } else {
            // It's a ridge
            I[i++] = r1; I[i++] = r2; I[i++] = numRegions+t1;
            count_ridge++;
        }
    }
    console.timeEnd('   setMapGeometry C');

    console.log(`valleys = ${count_valley} ridges = ${count_ridge}`);
    if (I.length !== i) { throw "wrong size"; }
    if (P.length !== p) { throw "wrong size"; }
};


/* Create a bitmap that will be used for texture mapping
   BEND textures will be ordered: {blank side, input side, output side}
   FORK textures will be ordered: {passive input side, active input side, output side}

   Cols will be the input flow rate
   Rows will be the output flow rate
*/
function assignTextureCoordinates(numSizes, textureSize) {
    /* create (numSizes+1)^2 size combinations, each with two triangles */
    function UV(x, y) {
        return {xy: [x, y], uv: [(x+0.5)/textureSize, (y+0.5)/textureSize]};
    }
    
    const spacing = 5;
    let triangles = [];
    let width = Math.floor((textureSize - 2*spacing) / (2*numSizes+3)) - spacing,
        height = Math.floor((textureSize - 2*spacing) / (numSizes+1)) - spacing;
    for (let row = 0; row <= numSizes; row++) {
        triangles[row] = [];
        for (let col = 0; col <= numSizes; col++) {
            let baseX = spacing + (2 * spacing + 2 * width) * col,
                baseY = spacing + (spacing + height) * row;
            triangles[row][col] = [
                [UV(baseX + width, baseY),
                 UV(baseX, baseY + height),
                 UV(baseX + 2*width, baseY + height)],
                [UV(baseX + 2*width + spacing, baseY + height),
                 UV(baseX + 3*width + spacing, baseY),
                 UV(baseX + width + spacing, baseY)]
            ];
        }
    }
    return triangles;
}


// TODO: turn this into an object :-/
const numRiverSizes = 20;
const riverTextureSize = 2048;
let riverTexturePositions = assignTextureCoordinates(numRiverSizes, riverTextureSize);
exports.createRiverBitmap = function() {
    let canvas = document.createElement('canvas');
    canvas.width = canvas.height = riverTextureSize;
    let ctx = canvas.getContext('2d');

    function lineWidth(i) {
        return i / numRiverSizes * riverTextureSize / 75;
    }
    
    ctx.lineCap = "round";
    for (let row = 0; row <= numRiverSizes; row++) {
        for (let col = 0; col <= numRiverSizes; col++) {
            for (let type = 0; type < 2; type++) {
                let pos = riverTexturePositions[row][col][type];
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(pos[0].xy[0], pos[0].xy[1]);
                ctx.lineTo(pos[1].xy[0], pos[1].xy[1]);
                ctx.lineTo(pos[2].xy[0], pos[2].xy[1]);
                ctx.lineTo(pos[0].xy[0], pos[0].xy[1]);
                ctx.clip();
                
                let center = [(pos[0].xy[0] + pos[1].xy[0] + pos[2].xy[0]) / 3,
                              (pos[0].xy[1] + pos[1].xy[1] + pos[2].xy[1]) / 3];
                let midpoint1 = vec2.lerp([], pos[1].xy, pos[2].xy, 0.5);
                let midpoint0 = vec2.lerp([], pos[0].xy, pos[1].xy, 0.5);
                let midpoint2 = vec2.lerp([], pos[2].xy, pos[0].xy, 0.5);

                ctx.strokeStyle = "hsl(200,50%,35%)";
                if (type === 1) {
                    ctx.lineWidth = lineWidth(col);
                    ctx.beginPath();
                    ctx.moveTo(midpoint1[0], midpoint1[1]);
                    ctx.lineTo(midpoint0[0], midpoint0[1]);
                    ctx.stroke();
                    ctx.lineWidth = lineWidth(row);
                    ctx.beginPath();
                    ctx.moveTo(midpoint0[0], midpoint0[1]);
                    ctx.lineTo(midpoint2[0], midpoint2[1]);
                    ctx.stroke();
                } else {
                    if (col > 0) {
                        ctx.lineWidth = Math.max(lineWidth(col), lineWidth(row));
                        ctx.beginPath();
                        ctx.moveTo(midpoint1[0], midpoint1[1]);
                        ctx.quadraticCurveTo(center[0], center[1], midpoint2[0], midpoint2[1]);
                        ctx.stroke();
                    } else {
                        ctx.lineWidth = lineWidth(row);
                        ctx.beginPath();
                        ctx.moveTo(center[0], center[1]);
                        ctx.lineTo(midpoint2[0], midpoint2[1]);
                        ctx.stroke();
                    }
                }

                ctx.restore();
            }
        }
    }
    
    return canvas;
};


function clamp(x, lo, hi) {
    if (x < lo) { x = lo; }
    if (x > hi) { x = hi; }
    return x;
}

/* Fill P:Float32Array with x,y,u,v data pointing to the river bitmap
   created in createRiverBitmap() */
exports.setRiverTextures = function(map, spacing, P) {
    let {mesh, t_downslope_s, s_flow} = map;
    let {numSolidTriangles, s_length} = mesh;
    if (P.length !== 3 * 4 * numSolidTriangles) { throw "wrong size"; }

    function riverSize(s) {
        // TODO: build a table of s_flow to flow
        let flow = Math.sqrt(s_flow[s]) * spacing / 25;
        let size = Math.ceil(flow * numRiverSizes / s_length[s]);
        return clamp(size, 1, numRiverSizes);
    }
    
    let p = 0, uv = [0, 0, 0, 0, 0, 0];
    for (let t = 0; t < numSolidTriangles; t++) {
        let out_s = t_downslope_s[t];
        let in1_s = mesh.s_next_s(out_s);
        let in2_s = mesh.s_next_s(in1_s);
        let flow_in1 = t_downslope_s[mesh.s_outer_t(in1_s)] === mesh.s_opposite_s(in1_s);
        let flow_in2 = t_downslope_s[mesh.s_outer_t(in2_s)] === mesh.s_opposite_s(in2_s);
        let textureRow = riverSize(out_s);
        if (flow_in1 && flow_in2) {
            /* FORK */
            if (s_flow[mesh.s_opposite_s(in1_s)] > s_flow[mesh.s_opposite_s(in2_s)]) {
                let textureCol = riverSize(mesh.s_opposite_s(in1_s));
                let texturePos = riverTexturePositions[textureRow][textureCol][1];
                uv[0] = texturePos[0].uv[0];
                uv[1] = texturePos[0].uv[1];
                uv[2] = texturePos[2].uv[0];
                uv[3] = texturePos[2].uv[1];
                uv[4] = texturePos[1].uv[0];
                uv[5] = texturePos[1].uv[1];
            } else {
                let textureCol = riverSize(mesh.s_opposite_s(in2_s));
                let texturePos = riverTexturePositions[textureRow][textureCol][1];
                uv[0] = texturePos[2].uv[0];
                uv[1] = texturePos[2].uv[1];
                uv[2] = texturePos[1].uv[0];
                uv[3] = texturePos[1].uv[1];
                uv[4] = texturePos[0].uv[0];
                uv[5] = texturePos[0].uv[1];
            }
        } else if (flow_in1) {
            /* BEND */
            let textureCol = riverSize(mesh.s_opposite_s(in1_s));
            let texturePos = riverTexturePositions[textureRow][textureCol][0];
            uv[0] = texturePos[0].uv[0];
            uv[1] = texturePos[0].uv[1];
            uv[2] = texturePos[2].uv[0];
            uv[3] = texturePos[2].uv[1];
            uv[4] = texturePos[1].uv[0];
            uv[5] = texturePos[1].uv[1];
        } else if (flow_in2) {
            /* BEND */
            let textureCol = riverSize(mesh.s_opposite_s(in2_s));
            let texturePos = riverTexturePositions[textureRow][textureCol][0];
            uv[0] = texturePos[2].uv[0];
            uv[1] = texturePos[2].uv[1];
            uv[2] = texturePos[1].uv[0];
            uv[3] = texturePos[1].uv[1];
            uv[4] = texturePos[0].uv[0];
            uv[5] = texturePos[0].uv[1];
        } else {
            /* SPRING */
            let textureCol = 0,
                textureRow = riverSize(out_s);
            let texturePos = riverTexturePositions[textureRow][textureCol][0];
            uv[0] = texturePos[0].uv[0];
            uv[1] = texturePos[0].uv[1];
            uv[2] = texturePos[2].uv[0];
            uv[3] = texturePos[2].uv[1];
            uv[4] = texturePos[1].uv[0];
            uv[5] = texturePos[1].uv[1];
        }
        let r1 = mesh.s_begin_r(3*t    ),
            r2 = mesh.s_begin_r(3*t + 1),
            r3 = mesh.s_begin_r(3*t + 2);
        P[p    ] = mesh.r_x(r1);
        P[p + 1] = mesh.r_y(r1);
        P[p + 4] = mesh.r_x(r2);
        P[p + 5] = mesh.r_y(r2);
        P[p + 8] = mesh.r_x(r3);
        P[p + 9] = mesh.r_y(r3);
        P[p + 4*(out_s - 3*t) + 2] = uv[0];
        P[p + 4*(out_s - 3*t) + 3] = uv[1];
        P[p + 4*(in1_s - 3*t) + 2] = uv[2];
        P[p + 4*(in1_s - 3*t) + 3] = uv[3];
        P[p + 4*(in2_s - 3*t) + 2] = uv[4];
        P[p + 4*(in2_s - 3*t) + 3] = uv[5];
        p += 12;
    }

    if (P.length !== p) { throw "wrong size"; }
};
