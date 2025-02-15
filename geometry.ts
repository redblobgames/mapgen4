/*
 * From http://www.redblobgames.com/maps/magpen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

import {vec2} from 'gl-matrix';
import Map from "./map.ts";
import type {Mesh} from "./types.d.ts";

/**
 * Fill a buffer with data from the mesh.
 */
function setMeshGeometry(mesh: Mesh, P: Float32Array) {
    let {numRegions, numTriangles} = mesh;
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = mesh.x_of_r(r);
        P[p++] = mesh.y_of_r(r);
    }
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = mesh.x_of_t(t);
        P[p++] = mesh.y_of_t(t);
    }
};

/**
 * Fill an indexed buffer with data from the map.
 */
function setMapGeometry(map: Map, I: Int32Array, P: Float32Array) {
    // TODO: V should probably depend on the slope, or elevation, or maybe it should be 0.95 in mountainous areas and 0.99 elsewhere
    const V = 0.95; // reduce elevation in valleys
    let {mesh, flow_s, elevation_r, elevation_t, rainfall_r} = map;
    let {numSolidSides, numRegions, numTriangles, is_boundary_t} = mesh;

    if (I.length !== 3 * numSolidSides) { throw "wrong size"; }
    if (P.length !== 2 * (numRegions + numTriangles)) { throw "wrong size"; }

    let p = 0;
    for (let r = 0; r < numRegions; r++) {
        P[p++] = elevation_r[r];
        P[p++] = rainfall_r[r];
    }
    for (let t = 0; t < numTriangles; t++) {
        P[p++] = V * elevation_t[t];
        let s0 = 3*t;
        let r1 = mesh.r_begin_s(s0),
            r2 = mesh.r_begin_s(s0+1),
            r3 = mesh.r_begin_s(s0+2);
        P[p++] = 1/3 * (rainfall_r[r1] + rainfall_r[r2] + rainfall_r[r3]);
    }

    let i = 0;
    for (let s = 0; s < numSolidSides; s++) {
        let s_opposite = mesh.s_opposite_s(s),
            r1 = mesh.r_begin_s(s),
            r2 = mesh.r_begin_s(s_opposite),
            t1 = mesh.t_inner_s(s),
            t2 = mesh.t_inner_s(s_opposite);
        
        // Each quadrilateral is turned into two triangles, so each
        // half-edge gets turned into one. There are two ways to fold
        // a quadrilateral. This is usually a nuisance but in this
        // case it's a feature. See the explanation here
        // https://www.redblobgames.com/x/1725-procedural-elevation/#rendering
        let is_valley = false;
        if (elevation_r[r1] < 0.0 || elevation_r[r2] < 0.0) is_valley = true;
        if (flow_s[s] > 0 || flow_s[s_opposite] > 0) is_valley = true;
        if (is_boundary_t[t1] || is_boundary_t[t2]) is_valley = false;
        if (is_valley) {
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
function assignTextureCoordinates(spacing: number, numSizes: number, textureSize: number) {
    /* create (numSizes+1)^2 size combinations, each with two triangles */
    function UV(x: number, y: number) {
        return {xy: [x, y], uv: [(x+0.5)/textureSize, (y+0.5)/textureSize]};
    }

    let triangles: any = [[]];
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
const riverTextureSpacing = 20; // TODO: should depend on river size
const numRiverSizes = 24; // NOTE: too high and rivers are low quality; too low and there's not enough variation
const riverTextureSize = 2048;
const riverMaximumFractionOfWidth = 0.5;
const riverTexturePositions = assignTextureCoordinates(riverTextureSpacing, numRiverSizes, riverTextureSize);
function createRiverBitmap() {
    let canvas = document.createElement('canvas');
    canvas.width = canvas.height = riverTextureSize;
    let ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    function lineWidth(i: number) {
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
                let midpoint12 = vec2.lerp(vec2.create(), pos[1].xy, pos[2].xy, 0.5);
                let midpoint20 = vec2.lerp(vec2.create(), pos[2].xy, pos[0].xy, 0.5);

                ctx.strokeStyle = "hsl(200,50%,35%)";
                if (type === 1) {
                    // TODO: river delta/fork sprite
                } else {
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


export function clamp(x: number, lo: number, hi: number): number {
    if (x < lo) { x = lo; }
    if (x > hi) { x = hi; }
    return x;
}

/**
 * Fill a buffer with river geometry
 */
function setRiverTextures(map: Map, spacing: number, riversParam: any, P: Float32Array): number {
    const MIN_FLOW = Math.exp(riversParam.lg_min_flow);
    const RIVER_WIDTH = Math.exp(riversParam.lg_river_width);
    let {mesh, s_downslope_t, flow_s} = map;
    let {numSolidTriangles, length_s} = mesh;

    function riverSize(s: number, flow: number): number {
        // TODO: performance: build a table of flow to width
        if (s < 0) { return 1; }
        let width = Math.sqrt(flow - MIN_FLOW) * spacing * RIVER_WIDTH;
        let size = Math.ceil(width * numRiverSizes / length_s[s]);
        return clamp(size, 1, numRiverSizes);
    }

    let p = 0;
    for (let t = 0; t < numSolidTriangles; t++) {
        let s_out = s_downslope_t[t];
        let outflow = flow_s[s_out];
        if (s_out < 0 || outflow < MIN_FLOW) continue;
        let r1 = mesh.r_begin_s(3*t    ),
            r2 = mesh.r_begin_s(3*t + 1),
            r3 = mesh.r_begin_s(3*t + 2);
        let s_in1 = mesh.s_next_s(s_out);
        let s_in2 = mesh.s_next_s(s_in1);
        let flow_in1 = flow_s[mesh.s_opposite_s(s_in1)];
        let flow_in2 = flow_s[mesh.s_opposite_s(s_in2)];
        let textureRow = riverSize(s_out, outflow);
        
        function add(r: number, c: number, i: number, j: number, k: number) {
            const T = riverTexturePositions[r][c][0];
            P[p    ] = mesh.x_of_r(r1);
            P[p + 1] = mesh.y_of_r(r1);
            P[p + 4] = mesh.x_of_r(r2);
            P[p + 5] = mesh.y_of_r(r2);
            P[p + 8] = mesh.x_of_r(r3);
            P[p + 9] = mesh.y_of_r(r3);
            P[p + 4*(s_out - 3*t) + 2] = T[i].uv[0];
            P[p + 4*(s_out - 3*t) + 3] = T[i].uv[1];
            P[p + 4*(s_in1 - 3*t) + 2] = T[j].uv[0];
            P[p + 4*(s_in1 - 3*t) + 3] = T[j].uv[1];
            P[p + 4*(s_in2 - 3*t) + 2] = T[k].uv[0];
            P[p + 4*(s_in2 - 3*t) + 3] = T[k].uv[1];
            p += 12;
        }
        
        if (flow_in1 >= MIN_FLOW) {
            add(textureRow, riverSize(s_in1, flow_in1), 0, 2, 1);
        }
        if (flow_in2 >= MIN_FLOW) {
            add(textureRow, riverSize(s_in2, flow_in2), 2, 1, 0);
        }
    }

    return p / 12;
};

export default {setMeshGeometry, createRiverBitmap, setMapGeometry, setRiverTextures};
