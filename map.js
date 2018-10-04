// @ts-check
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
    slope: 20,
    density: 1500,
};

/**
 * @typedef { import("./types").Mesh } Mesh
 */

/**
 * Mountains are peaks surrounded by steep dropoffs. In the point
 * selection process (mesh.js) we pick the mountain peak locations.
 * Here we calculate a distance field from peaks to all other points.
 *
 * We'll use breadth first search for this because it's simple and
 * fast. Dijkstra's Algorithm would produce a more accurate distance
 * field, but we only need an approximation.
 *
 * @param {Mesh} mesh
 * @param {number[]} seeds_t - a list of triangles with mountain peaks
 * @param {number} spacing - the global param.spacing value
 * @return {Float32Array} - the distance field indexed by t
 */
function calculateMountainDistance(mesh, seeds_t, spacing) {
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
                distance_t[neighbor_t] = distance_t[current_t] + spacing;
                queue_t.push(neighbor_t);
            }
        }
    }
    // TODO: maybe switch to +1 instead of +spacing, and put spacing
    // into mountain_slope; that'd let me use 8-bit int; TODO: try
    // adding randomness to +spacing to see if the output looks more
    // interesting
    return distance_t;
}

/**
 * Save noise values in arrays.
 *
 * @param {SimplexNoise} noise - the noise generator
 * @param {Mesh} mesh
 * @returns {Float32Array[]} - noise indexed by triangle id, for several octaves
 */
function precalculateNoise(noise, mesh) {
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
    return [noise0, noise1, noise2, noise3, noise4];
}

        
class Map {
    /**
     * @param {Mesh} mesh
     * @param {number[]} peaks_t - array of triangle indices for mountain peaks
     * @param {any} param - global parameters
     */
    constructor (mesh, peaks_t, param) {
        this.mesh = mesh;
        this.seed = param.seed;
        this.spacing = /** @type{number} */(param.spacing);
        this.noise = new SimplexNoise(makeRandFloat(param.seed));
        this.t_elevation = new Float32Array(mesh.numTriangles);
        this.r_elevation = new Float32Array(mesh.numRegions);
        this.r_humidity = new Float32Array(mesh.numRegions);
        this.t_moisture = new Float32Array(mesh.numTriangles);
        this.r_moisture = new Float32Array(mesh.numRegions);
        this.t_downslope_s = new Int32Array(mesh.numTriangles);
        this.order_t = new Int32Array(mesh.numTriangles);
        this.t_flow = new Float32Array(mesh.numTriangles);
        this.s_flow = new Float32Array(mesh.numSides);
        this.wind_order_r = new Int32Array(mesh.numRegions);
        this.r_wind_sort = new Float32Array(mesh.numRegions);
        this.windAngleDeg = undefined;
        this.precomputed = {
            noise: precalculateNoise(this.noise, mesh),
            t_mountain_distance: calculateMountainDistance(mesh, peaks_t, param.spacing),
        };
    }

    assignTriangleElevation(constraints) {
        let {mesh, noise, spacing, t_elevation} = this;
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
                return -1.0;
            }
        }
        for (let t = 0; t < numSolidTriangles; t++) {
            t_elevation[t] = constraintAt(mesh.t_x(t)/1000, mesh.t_y(t)/1000);
        }
        
        // For land triangles, mix hill and mountain terrain together
        const mountain_slope = mountain.slope,
              t_mountain_distance = this.precomputed.t_mountain_distance,
              noise0 = this.precomputed.noise[0],
              noise1 = this.precomputed.noise[1],
              noise2 = this.precomputed.noise[2],
              noise4 = this.precomputed.noise[4];
        for (let t = 0; t < numTriangles; t++) {
            let e = t_elevation[t];
            if (e > 0) {
                /* Mix two sources of elevation:
                 *
                 * 1. eh: Hills are formed using simplex noise. These
                 *    are very low amplitude, and the main purpose is
                 *    to make the rivers meander. The amplitude
                 *    doesn't make much difference in the river
                 *    meandering. These hills shouldn't be
                 *    particularly visible so I've kept the amplitude
                 *    low.
                 *
                 * 2. em: Mountains are formed using something similar to
                 *    worley noise. These form distinct peaks, with
                 *    varying distance between them.
                 */
                // TODO: these noise parameters should be exposed in UI - lower numbers mean more meandering in rivers
                // TODO: precompute eh, em per triangle
                let noisiness = 1.0 - 0.5 * (1 + noise0[t]);
                let eh = (1 + noisiness * noise4[t] + (1 - noisiness) * noise2[t]) / 50;
                if (eh < 0.01) { eh = 0.01; }
                let em = 1 - mountain_slope/1000 * t_mountain_distance[t];
                if (em < 0.01) { em = 0.01; }
                let weight = e * e;
                e = (1-weight) * eh + weight * em;
            } else {
                /* Add noise to make it more interesting. */
                e *= 1.5 + noise1[t]; // TODO: parameter
            }
            if (e < -1.0) { e = -1.0; }
            if (e > +1.0) { e = +1.0; }
            t_elevation[t] = e;
        }
    }
    
    assignRegionElevation(constraints) {
        let {mesh, t_elevation, r_elevation} = this;
        let {numRegions, _r_in_s, _halfedges} = mesh;
        let out_t = [];
        for (let r = 0; r < numRegions; r++) {
            let count = 0, e = 0, water = false;
            const s0 = _r_in_s[r];
            let incoming = s0;
            do {
                let t = (incoming/3) | 0;
                e += t_elevation[t];
                water = water || t_elevation[t] < 0.0;
                let outgoing = mesh.s_next_s(incoming);
                incoming = _halfedges[outgoing];
                count++;
            } while (incoming !== s0);
            e /= count;
            if (water && e >= 0) { e = -0.001; }
            r_elevation[r] = e;
        }
    }

    assignElevation(constraints) {
        this.assignTriangleElevation(constraints);
        this.assignRegionElevation();
    }

    assignMoisture(windAngleDeg) {
        const {mesh, wind_order_r, r_wind_sort, r_humidity, r_moisture, r_elevation} = this;
        const {numRegions, _r_in_s, _halfedges} = mesh;

        if (windAngleDeg != this.windAngleDeg) {
            this.windAngleDeg = windAngleDeg;
            const windAngleRad = Math.PI / 180 * windAngleDeg;
            const windAngleVec = [Math.cos(windAngleRad), Math.sin(windAngleRad)];
            for (let r = 0; r < numRegions; r++) {
                wind_order_r[r] = r;
                r_wind_sort[r] = mesh.r_x(r) * windAngleVec[0] + mesh.r_y(r) * windAngleVec[1];
            }
            wind_order_r.sort((r1, r2) => r_wind_sort[r1] - r_wind_sort[r2]);
        }

        // TODO: rename moisture to rainfall
        let out_r = [];
        for (let r of wind_order_r) {
            let count = 0, sum = 0.0;
            let s0 = _r_in_s[r], incoming = s0;
            do {
                let neighbor_r = mesh.s_begin_r(incoming);
                if (r_wind_sort[neighbor_r] < r_wind_sort[r]) {
                    count++;
                    sum += r_humidity[neighbor_r];
                }
                let outgoing = mesh.s_next_s(incoming);
                incoming = _halfedges[outgoing];
            } while (incoming !== s0);
            
            let moisture = 0.0, rainfall = 0.0;
            if (count > 0) {
                moisture = sum / count;
                rainfall += 0.9 * moisture; // TODO: param
            }
            if (mesh.r_boundary(r)) {
                moisture = 1.0;
            }
            if (r_elevation[r] < 0.0) {
                let evaporation = 0.5 * -r_elevation[r];
                moisture += evaporation;
            }
            if (moisture > 1.0 - r_elevation[r]) {
                let orographicRainfall = 0.5 * (moisture - (1.0 - r_elevation[r])); // TODO: parameter, should also depend on param.spacing
                rainfall += 2 * orographicRainfall; // TODO: parameter: mountains cause a lot more rainfall than plains
                moisture -= orographicRainfall;
            }
            r_moisture[r] = rainfall;
            r_humidity[r] = moisture;
        }
    }

    assignRivers() {
        let {mesh, t_moisture, r_moisture, t_elevation, t_downslope_s, order_t, t_flow, s_flow} = this;
        assignDownflow(mesh, t_elevation, t_downslope_s, order_t);
        assignMoisture(mesh, r_moisture, t_moisture);
        assignFlow(mesh, order_t, t_elevation, t_moisture, t_downslope_s, t_flow, s_flow);
    }
        
}


/**
 * Use prioritized graph exploration to assign river flow direction
 *
 * @param {Mesh} mesh
 * @param {Float32Array} t_elevation - elevation per triangle
 * @param {Int32Array} t_downflow_s - OUT parameter - the side each triangle flows out of
 * @param {Int32Array} order_t - OUT parameter - pre-order in which the graph was traversed,
 *   so roots of the tree always get visited before leaves; use reverse to visit leaves before roots
 */
let queue = new FlatQueue();
function assignDownflow(mesh, t_elevation, /* out */ t_downflow_s, /* out */ order_t) {
    /* Use a priority queue, starting with the ocean triangles and
     * moving upwards using elevation as the priority, to visit all
     * the land triangles */
    let {numTriangles} = mesh,
        queue_in = 0;
    t_downflow_s.fill(-999);
    /* Part 1: ocean triangles get downslope assigned to the lowest neighbor */
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] < 0) {
            let best_s = -1, best_e = t_elevation[t];
            for (let j = 0; j < 3; j++) {
                let s = 3 * t + j,
                    e = t_elevation[mesh.s_outer_t(s)];
                if (e < best_e) {
                    best_e = e;
                    best_s = s;
                }
            }
            order_t[queue_in++] = t;
            t_downflow_s[t] = best_s;
            queue.push(t, t_elevation[t]);
        }
    }
    /* Part 2: land triangles get visited in elevation priority */
    for (let queue_out = 0; queue_out < numTriangles; queue_out++) {
        let current_t = queue.pop();
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.s_outer_t(s); // uphill from current_t
            if (t_downflow_s[neighbor_t] === -999 && t_elevation[neighbor_t] >= 0.0) {
                t_downflow_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
                queue.push(neighbor_t, t_elevation[neighbor_t]);
            }
        }
    }
}


/**
 * @param {Mesh} mesh
 * @param {Float32Array} r_moisture - per region
 * @param {Float32Array} t_moisture - OUT parameter - per triangle
 */
function assignMoisture(mesh, r_moisture, /* out */ t_moisture) {
    const {numTriangles} = mesh;
    for (let t = 0; t < numTriangles; t++) {
        let moisture = 0.0;
        for (let i = 0; i < 3; i++) {
            let s = 3 * t + i,
                r = mesh.s_begin_r(s);
            moisture += r_moisture[r] / 3;
        }
        t_moisture[t] = moisture;
    }
}


/**
 * order_t:      Int32Array[numTriangles]
 * t_elevation:  Float32Array[numTriangles]
 * t_moisture:   Float32Array[numTriangles]
 * t_flow:       Float32Array[numTriangles]
 * s_flow:       Float32Array[numSides]
 */
function assignFlow(mesh, order_t, t_elevation, t_moisture, t_downflow_s, /* out */ t_flow, /* out */ s_flow) {
    let {numTriangles, _halfedges} = mesh;
    s_flow.fill(0);
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] >= 0.0) {
            t_flow[t] = 0.2 * t_moisture[t] * t_moisture[t]; // TODO: nonlinear mapping should be a parameter
        } else {
            t_flow[t] = 0;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        let tributary_t = order_t[i];
        let flow_s = t_downflow_s[tributary_t];
        let trunk_t = (_halfedges[flow_s] / 3) | 0;
        if (flow_s >= 0) {
            t_flow[trunk_t] += t_flow[tributary_t];
            s_flow[flow_s] += t_flow[tributary_t]; // TODO: isn't s_flow[flow_s] === t_flow[?]
            if (t_elevation[trunk_t] > t_elevation[tributary_t]) {
                t_elevation[trunk_t] = t_elevation[tributary_t];
            }
        }
    }
}


module.exports = Map;
