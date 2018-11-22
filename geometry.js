/*
 * From http://www.redblobgames.com/maps/magpen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

let {vec2} = require('gl-matrix');

/**
 * @typedef { import("./types").Mesh } Mesh
 * @typedef { import("./map") } Map
 */


/**
 * Fill a buffer with data from the mesh.
 *
 * @param {Mesh} mesh
 * @param {Float32Array} P - x,y for each region, then for each triangle
 */
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

/**
 * Fill an indexed buffer with data from the map.
 *
 * @param {Map} map
 * @param {Int32Array} I - indices into the data array
 * @param {Float32Array} P - elevation, rainfall data
 */
exports.setMapGeometry = function(map, I, P) {
    // TODO: V should probably depend on the slope, or elevation, or maybe it should be 0.95 in mountainous areas and 0.99 elsewhere
    const V = 0.95; // reduce elevation in valleys
    let {mesh, s_flow, r_elevation, t_elevation, r_rainfall} = map;
    let {numSolidSides, numRegions, numTriangles} = mesh;

    if (I.length !== 3 * numSolidSides) { throw "wrong size"; }
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = r_elevation[r];
        P[p++] = r_rainfall[r];
    }
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = V * t_elevation[t];
        let s0 = 3*t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0+1),
            r3 = mesh.s_begin_r(s0+2);
        P[p++] = 1/3 * (r_rainfall[r1] + r_rainfall[r2] + r_rainfall[r3]);
    }

    // TODO: split this into its own function; it can be updated separately, and maybe not as often
    let i = 0;
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
        let coast = r_elevation[r1] < 0.0 || r_elevation[r2] < 0.0;
        if (coast || s_flow[s] > 0 || s_flow[opposite_s] > 0) {
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


/**
 * Create a bitmap that will be used for texture mapping
 *   BEND textures will be ordered: {blank side, input side, output side}
 *   FORK textures will be ordered: {passive input side, active input side, output side}
 *
 * Cols will be the input flow rate
 * Rows will be the output flow rate
*/
function assignTextureCoordinates(spacing, numSizes, textureSize) {
    /* create (numSizes+1)^2 size combinations, each with two triangles */
    function UV(x, y) {
        return {xy: [x, y], uv: [(x+0.5)/textureSize, (y+0.5)/textureSize]};
    }

    let triangles = [[]];
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
const riverTextureSpacing = 40; // TODO: should depend on river size
const numRiverSizes = 24; // NOTE: too high and rivers are low quality; too low and there's not enough variation
const riverTextureSize = 4096;
const riverMaximumFractionOfWidth = 0.5;
const riverTexturePositions = assignTextureCoordinates(riverTextureSpacing, numRiverSizes, riverTextureSize);
exports.createRiverBitmap = function() {
    let canvas = document.createElement('canvas');
    canvas.width = canvas.height = riverTextureSize;
    let ctx = canvas.getContext('2d');

    function lineWidth(i) {
        const spriteSize = riverTexturePositions[0][1][0][0].xy[0] - riverTexturePositions[0][0][0][0].xy[0];
        return i / numRiverSizes * spriteSize * riverMaximumFractionOfWidth;
    }
    ctx.lineCap = "round";
    for (let row = 0; row <= numRiverSizes; row++) {
        for (let col = 0; col <= numRiverSizes; col++) {
            for (let type = 0; type < 2; type++) {
                let pos = riverTexturePositions[row][col][type];
                ctx.save();
                ctx.beginPath();
                ctx.rect(pos[1].xy[0] - riverTextureSpacing/2, pos[0].xy[1] - riverTextureSpacing/2,
                         pos[2].xy[0] - pos[1].xy[0] + riverTextureSpacing, pos[2].xy[1] - pos[0].xy[1] + riverTextureSpacing);
                // ctx.clip(); // TODO: to make this work right, the spacing needs to vary based on the river size, I think
                
                let center = [(pos[0].xy[0] + pos[1].xy[0] + pos[2].xy[0]) / 3,
                              (pos[0].xy[1] + pos[1].xy[1] + pos[2].xy[1]) / 3];
                let midpoint12 = vec2.lerp([], pos[1].xy, pos[2].xy, 0.5);
                let midpoint20 = vec2.lerp([], pos[2].xy, pos[0].xy, 0.5);

                ctx.strokeStyle = "hsl(200,50%,35%)";
                if (type === 1) {
                    // TODO: river delta/fork sprite
                } else {
                    const w = 1; /* TODO: draw a path and fill it; that will allow variable width */
                    let c = vec2.lerp([], pos[1].xy, pos[2].xy, 0.5 - w),
                        d = vec2.lerp([], pos[1].xy, pos[2].xy, 0.5 + w),
                        a = vec2.lerp([], pos[0].xy, pos[1].xy, 0.5 - w),
                        f = vec2.lerp([], pos[0].xy, pos[1].xy, 0.5 + w),
                        b = null /* TODO: intersect lines */,
                        e = null /* TODO: intersect lines */;

                    if (col > 0) {
                        ctx.lineWidth = Math.min(lineWidth(col), lineWidth(row));
                        ctx.beginPath();
                        ctx.moveTo(midpoint12[0], midpoint12[1]);
                        ctx.quadraticCurveTo(center[0], center[1], midpoint20[0], midpoint20[1]);
                        ctx.stroke();
                    } else {
                        ctx.lineWidth = lineWidth(row);
                        ctx.beginPath();
                        ctx.moveTo(center[0], center[1]);
                        ctx.lineTo(midpoint20[0], midpoint20[1]);
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

/**
 * Fill a buffer with river geometry
 *
 * @param {Map} map
 * @param {number} spacing - global param.spacing value
 * @param {any} riversParam - global param.rivers
 * @param {Float32Array} P - array of x,y,u,v triples for the river triangles
 * @returns {number} - how many triangles were needed (at most numSolidTriangles)
 */
exports.setRiverTextures = function(map, spacing, riversParam, P) {
    const MIN_FLOW = Math.exp(riversParam.lg_min_flow);
    const RIVER_WIDTH = Math.exp(riversParam.lg_river_width);
    let {mesh, t_downslope_s, s_flow} = map;
    let {numSolidTriangles, s_length} = mesh;

    function riverSize(s, flow) {
        // TODO: performance: build a table of flow to width
        if (s < 0) { return 1; }
        let width = Math.sqrt(flow - MIN_FLOW) * spacing * RIVER_WIDTH;
        let size = Math.ceil(width * numRiverSizes / s_length[s]);
        return clamp(size, 1, numRiverSizes);
    }

    let p = 0, uv = [0, 0, 0, 0, 0, 0];
    for (let t = 0; t < numSolidTriangles; t++) {
        let out_s = t_downslope_s[t];
        let out_flow = s_flow[out_s];
        if (out_s < 0 || out_flow < MIN_FLOW) continue;
        let r1 = mesh.s_begin_r(3*t    ),
            r2 = mesh.s_begin_r(3*t + 1),
            r3 = mesh.s_begin_r(3*t + 2);
        let in1_s = mesh.s_next_s(out_s);
        let in2_s = mesh.s_next_s(in1_s);
        let in1_flow = s_flow[mesh.s_opposite_s(in1_s)];
        let in2_flow = s_flow[mesh.s_opposite_s(in2_s)];
        let textureRow = riverSize(out_s, out_flow);
        
        function add(r, c, i, j, k) {
            const T = riverTexturePositions[r][c][0];
            P[p    ] = mesh.r_x(r1);
            P[p + 1] = mesh.r_y(r1);
            P[p + 4] = mesh.r_x(r2);
            P[p + 5] = mesh.r_y(r2);
            P[p + 8] = mesh.r_x(r3);
            P[p + 9] = mesh.r_y(r3);
            P[p + 4*(out_s - 3*t) + 2] = T[i].uv[0];
            P[p + 4*(out_s - 3*t) + 3] = T[i].uv[1];
            P[p + 4*(in1_s - 3*t) + 2] = T[j].uv[0];
            P[p + 4*(in1_s - 3*t) + 3] = T[j].uv[1];
            P[p + 4*(in2_s - 3*t) + 2] = T[k].uv[0];
            P[p + 4*(in2_s - 3*t) + 3] = T[k].uv[1];
            p += 12;
        }
        
        if (in1_flow >= MIN_FLOW) {
            add(textureRow, riverSize(in1_s, in1_flow), 0, 2, 1);
        }
        if (in2_flow >= MIN_FLOW) {
            add(textureRow, riverSize(in2_s, in2_flow), 2, 1, 0);
        }
    }

    return p / 12;
};
