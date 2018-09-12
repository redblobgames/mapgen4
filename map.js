/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module has the procedural map generation algorithms (elevations, rivers)
 */
'use strict';

const SimplexNoise = require('simplex-noise');
const FlatQueue = require('flatqueue');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');

const mountain = {
    land_limit: 200,
    slope: 25,
    density: 1500,
}

/*
 * Mountains are peaks surrounded by steep dropoffs. We need to:
 *
 *   1. Pick the locations of the peaks.
 *   2. Calculate the distance from every triangle to the nearest peak.
 *
 * We'll use breadth first search for this because it's simple and
 * fast. Dijkstra's Algorithm would produce a more accurate distance
 * field, but we only need an approximation.
 */
function chooseMountainPeaks(mesh, spacing, randFloat) {
    // TODO: this may be better as blue noise, but it needs to be converted to the mesh
    const fractionOfPeaks = spacing*spacing / mountain.density;
    let peak_t = [];
    for (let t = 0; t < mesh.numTriangles; t++) {
        if (randFloat() < fractionOfPeaks) {
            peak_t.push(t);
        }
    }
    return peak_t;
}

function calculateMountainDistance(mesh, seeds_t) {
    console.time('   calculateMountainDistance');
    let {s_length} = mesh;
    let distance_t = new Float32Array(mesh.numTriangles);
    distance_t.fill(-1);
    let queue_t = seeds_t.concat([]);
    for (let i = 0; i < queue_t.length; i++) {
        let current_t = queue_t[i];
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.s_outer_t(s);
            if (distance_t[neighbor_t] === -1) {
                // TODO: s_length can be very large near the
                // boundaries; not sure if I should use +s_length or
                // +spacing
                distance_t[neighbor_t] = distance_t[current_t] + s_length[s];
                queue_t.push(neighbor_t);
            }
        }
    }
    console.timeEnd('   calculateMountainDistance');
    // TODO: maybe switch to +1 instead of s_length, and then divide
    // by spacing later; that'd let me use 8-bit int, and also let me
    // reuse breadth first search used for other distance fields
    return distance_t;
}

function precalculateNoise(noise, mesh) {
    console.time('   precalculateNoise');
    let {numTriangles} = mesh;
    let noise0 = new Float32Array(numTriangles),
        noise1 = new Float32Array(numTriangles),
        noise2 = new Float32Array(numTriangles),
        noise3 = new Float32Array(numTriangles),
        noise4 = new Float32Array(numTriangles);
    for (let t = 0; t < numTriangles; t++) {
        let nx = (mesh.t_x(t)-500) / 500,
            ny = (mesh.t_y(t)-500) / 500;
        noise0[t] = noise.noise2D(nx, ny);
        noise1[t] = noise.noise2D(2*nx + 5, 2*ny + 5);
        noise2[t] = noise.noise2D(4*nx + 7, 4*ny + 7);
        noise3[t] = noise.noise2D(8*nx + 9, 8*ny + 9);
        noise4[t] = noise.noise2D(16*nx + 15, 16*ny + 15);
    }
    console.timeEnd('   precalculateNoise');
    return [noise0, noise1, noise2, noise3, noise4];
}

        
function elevation(x, y, {t_mountain_distance, noise}, t) {
    const mountain_slope = 25;
    let base = (0.75 * noise[0][t]
                + 0.5 * noise[1][t]
                + 0.125 * noise[2][t]
                + 0.0625 * noise[3][t]);

    let e = base;
    return e;
}


class Map {
    constructor (mesh, param) {
        console.time('map-alloc');
        this.mesh = mesh;
        this.seed = param.seed;
        this.spacing = param.spacing;
        this.noise = new SimplexNoise(makeRandFloat(param.seed));
        this.t_elevation = new Float32Array(mesh.numTriangles);
        this.r_elevation = new Float32Array(mesh.numRegions);
        this.r_moisture = new Float32Array(mesh.numRegions);
        this.r_water = new Int8Array(mesh.numRegions);
        this.t_downslope_s = new Int32Array(mesh.numTriangles);
        this.order_t = new Int32Array(mesh.numTriangles);
        this.t_flow = new Float32Array(mesh.numTriangles);
        this.s_flow = new Float32Array(mesh.numSides);
        this.precomputed = {
            noise: precalculateNoise(this.noise, mesh),
            t_mountain_distance: calculateMountainDistance(mesh, chooseMountainPeaks(mesh, param.spacing, makeRandFloat(param.seed))),
        };
        this.seeds_t = [];
        this.coastline_t = [];
        console.timeEnd('map-alloc');
    }

    assignTriangleElevation(constraints) {
        console.time('map-elevation-1');
        let {mesh, noise, spacing, t_elevation, coastline_t, seeds_t} = this;
        let {numTriangles, numSolidTriangles, numRegions, numSides} = mesh;

        // Assign elevations to triangles
        function constraintAt(x, y) {
            // https://en.wikipedia.org/wiki/Bilinear_interpolation
            const C = constraints.constraints, size = constraints.size;
            x *= size; y *= size;
            let xInt = Math.floor(x),
                yInt = Math.floor(y),
                xFrac = x - xInt,
                yFrac = y - yInt;
            if (0 <= xInt && xInt+1 < size && 0 <= yInt && yInt+1 < size) {
                let p = size * yInt + xInt;
                let e00 = C[p],
                    e01 = C[p + 1],
                    e10 = C[p + size],
                    e11 = C[p + size + 1];
                return ((e00 * (1 - xFrac) + e01 * xFrac) * (1 - yFrac)
                        + (e10 * (1 - xFrac) + e11 * xFrac) * yFrac);
            } else {
                return -128;
            }
        }
        for (let t = 0; t < numSolidTriangles; t++) {
            let constraint = constraintAt(mesh.t_x(t)/1000, mesh.t_y(t)/1000);
            t_elevation[t] = constraint / 128.0;
        }
        for (let t = numSolidTriangles; t < numTriangles; t++) {
            t_elevation[t] = 0.0;
        }
        
        // Determine coastal triangles: those with some land and some
        // ocean neighbors
        seeds_t.splice(0);
        for (let t = 0; t < numSolidTriangles; t++) {
            let ocean = 0;
            for (let i = 0; i < 3; i++) {
                let s = 3 * t + i;
                let opposite_s = mesh._halfedges[s];
                let neighbor_t = (opposite_s / 3) | 0;
                if (t_elevation[neighbor_t] < 0.0) { ocean++; }
            }
            if (ocean !== 0 && ocean !== 3) {
                seeds_t.push(t);
            }
        }
        for (let t of seeds_t) { t_elevation[t] = 0.0; }

        // For land triangles, mix hill and mountain terrain together
        const mountain_slope = mountain.slope,
              t_mountain_distance = this.precomputed.t_mountain_distance,
              noise0 = this.precomputed.noise[0],
              noise1 = this.precomputed.noise[1],
              noise2 = this.precomputed.noise[2],
              noise4 = this.precomputed.noise[4];
        for (let t = 0; t < numTriangles; t++) {
            let e = t_elevation[t];
            if (e >= 0) {
                /* Mix two sources of elevation: 
                 *
                 * 1. eh: Hills are formed using simplex noise. These
                 *    are very low amplitude, and the main purpose is
                 *    to make the rivers meander. The amplitude
                 *    doesn't make much difference in the river
                 *    meandering. These hills shouldn't be
                 *    particularly visible so I've kept the amplitude
                 *    low. (TODO: make this a map parameter?)
                 * 
                 * 2. em: Mountains are formed using something similar to
                 *    worley noise. These form distinct peaks, with
                 *    varying distance between them. 
                 */
                // TODO: these noise parameters should be exposed in UI - lower numbers mean more meandering in rivers
                let noisiness = 1.0 - 0.5 * (1 + noise0[t]);
                let eh = (1 + noisiness * noise4[t] + (1 - noisiness) * noise2[t]) / 50;
                if (eh < 0.01) { eh = 0.01; }
                let em = 1 - mountain_slope/1000 * t_mountain_distance[t];
                if (em < 0.01) { em = 0.01; }
                let weight = e * e;
                e = (1-weight) * eh + weight * em;
            } else {
                /* The water depth depends on distance to the coast
                 * and also some noise. The purpose is to make the
                 * shades of blue vary. */
                e *= 2 + noise1[t];
            }
            if (e < -1.0) { e = -1.0; }
            if (e > +1.0) { e = +1.0; }
            t_elevation[t] = e;
        }
        
        console.timeEnd('map-elevation-1');
    }
    
    assignRegionElevation() {
        console.time('map-elevation-2');
        let {mesh, t_elevation, r_elevation, r_moisture, r_water} = this;
        let out_t = [];
        for (let r = 0; r < mesh.numRegions; r++) {
            let e = 0, water = false;
            mesh.r_circulate_t(out_t, r);
            // TODO: might be faster to calculate this the other way -- iterate over triangles, and add 1/3 of each triangle's elevation to the region's elevation, and set water if any triangle is water
            for (let t of out_t) { e += t_elevation[t]; water = water || t_elevation[t] < 0.0; }
            e /= out_t.length;
            // TODO: r_water has already been assigned; use that instead of the water flag
            if (water && e >= 0) { e = -0.001; }
            r_elevation[r] = e;
            r_moisture[r] = 0.8 - Math.sqrt(Math.abs(e));
            r_water[r] = (e < 0) ? 1 : 0;
        }
        console.timeEnd('map-elevation-2');
    }
    
    assignElevation(constraints) {
        this.assignTriangleElevation(constraints);
        this.assignRegionElevation();
    }

    assignRivers() {
        let {mesh, seeds_t, t_elevation, t_downslope_s, order_t, t_flow, s_flow} = this;
        console.time('map-rivers-1');
        dijkstra_search(mesh, seeds_t, t_elevation, t_downslope_s, order_t);
        console.timeEnd('map-rivers-1');
        console.time('map-rivers-2');
        assign_flow(mesh, order_t, t_elevation, t_downslope_s, t_flow, s_flow);
        console.timeEnd('map-rivers-2');
    }
        
}


/**
 * seeds_t: array of int
 * t_elevation: Float32Array[numTriangles]
 * t_downflow_s: Int32Array[numTriangles]
 * order_t: Int32Array[numTriangles]
 */
let queue = new FlatQueue();
function dijkstra_search(mesh, seeds_t, t_elevation, /* out */ t_downflow_s, /* out */ order_t) {
    // TODO: no need to do this for oceans
    seeds_t = [];
    for (let t = mesh.numSolidTriangles; t < mesh.numTriangles; t++) {
        seeds_t.push(t);
    }
    
    let numSeeds = seeds_t.length,
        {numTriangles} = mesh;
    t_downflow_s.fill(-999);
    seeds_t.forEach(t => {
        t_downflow_s[t] = -1;
        queue.push(t, t_elevation[t]);
    });
    order_t.set(seeds_t);
    for (let queue_in = numSeeds, queue_out = 0; queue_out < numTriangles; queue_out++) {
        let current_t = queue.pop();
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.s_outer_t(s); // uphill from current_t
            if (t_downflow_s[neighbor_t] === -999) {
                t_downflow_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
                queue.push(neighbor_t, t_elevation[neighbor_t]);
            }
        }
    }
    if (queue.length !== 0) {
        console.log('NOT EMPTY', queue.length, queue);
        while (queue.length > 0) queue.pop();
    }
    // order_t is the visit pre-order, so roots of the tree always get
    // visited before leaves; we can use this in reverse to visit
    // leaves before roots
}


/**
 * order_t: Int32Array[numTriangles]
 * t_elevation: Float32Array[numTriangles]
 * t_flow: Float32Array[numTriangles]
 * s_flow: Float32Array[numSides]
 */
function assign_flow(mesh, order_t, t_elevation, t_downflow_s, /* out */ t_flow, /* out */ s_flow) {
    // TODO: no need to do this for oceans
    let {numTriangles, _halfedges} = mesh;
    s_flow.fill(0);
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] > 0.0) {
            t_flow[t] = 1;
        } else {
            t_flow[t] = 0;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        // t1 is the tributary and t2 is the trunk
        let t1 = order_t[i];
        let s = t_downflow_s[t1];
        let t2 = (_halfedges[s] / 3) | 0;
        if (s >= 0 && t_elevation[t2] >= 0.0) {
            t_flow[t2] += t_flow[t1];
            s_flow[s] += t_flow[t1]; // TODO: isn't s_flow[s] === t_flow[?]
            if (t_elevation[t2] > t_elevation[t1]) {
                t_elevation[t2] = t_elevation[t1];
            }
        }
    }
}


module.exports = Map;
