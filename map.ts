// @ts-check
/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module has the procedural map generation algorithms (elevations, rivers)
 */
'use strict';

import {createNoise2D} from 'simplex-noise';
import FlatQueue from 'flatqueue';
import {makeRandFloat} from "./prng.ts";
import type {Mesh} from "./types.d.ts";

type PrecalculatedNoise = {
    t_noise0: Float32Array;
    t_noise1: Float32Array;
    t_noise2: Float32Array;
    /* t_noise3 wasn't being used */
    t_noise4: Float32Array;
    t_noise5: Float32Array;
    t_noise6: Float32Array;
}

const mountain = {
    slope: 20,
    density: 1500,
};

/**
 * Mountains are peaks surrounded by steep dropoffs. In the point
 * selection process (mesh.js) we pick the mountain peak locations.
 * Here we calculate a distance field from peaks to all other points.
 *
 * We'll use breadth first search for this because it's simple and
 * fast. Dijkstra's Algorithm would produce a more accurate distance
 * field, but we only need an approximation. For increased
 * interestingness, we add some randomness to the distance field.
 */
function calculateMountainDistance(mesh: Mesh, seeds_t: number[], spacing: number, jaggedness: number, randFloat: () => number, t_distance: Float32Array) {
    t_distance.fill(-1);
    let queue_t = seeds_t.concat([]);
    for (let i = 0; i < queue_t.length; i++) {
        let current_t = queue_t[i];
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.t_outer_s(s);
            if (t_distance[neighbor_t] === -1) {
                let increment = spacing * (1 + jaggedness * (randFloat() - randFloat()));
                t_distance[neighbor_t] = t_distance[current_t] + increment;
                queue_t.push(neighbor_t);
            }
        }
    }
}

/**
 * Save noise values in arrays.
 */
function precalculateNoise(randFloat: () => number, mesh: Mesh): PrecalculatedNoise {
    const noise2D = createNoise2D(randFloat);
    let {numTriangles} = mesh;
    let t_noise0 = new Float32Array(numTriangles),
        t_noise1 = new Float32Array(numTriangles),
        t_noise2 = new Float32Array(numTriangles),
        t_noise4 = new Float32Array(numTriangles),
        t_noise5 = new Float32Array(numTriangles),
        t_noise6 = new Float32Array(numTriangles);
    for (let t = 0; t < numTriangles; t++) {
        let nx = (mesh.x_of_t(t)-500) / 500,
            ny = (mesh.y_of_t(t)-500) / 500;
        t_noise0[t] = noise2D(nx, ny);
        t_noise1[t] = noise2D(2*nx + 5, 2*ny + 5);
        t_noise2[t] = noise2D(4*nx + 7, 4*ny + 7);
        t_noise4[t] = noise2D(16*nx + 15, 16*ny + 15);
        t_noise5[t] = noise2D(32*nx + 31, 32*ny + 31);
        t_noise6[t] = noise2D(64*nx + 67, 64*ny + 67);
    }
    return {t_noise0, t_noise1, t_noise2, t_noise4, t_noise5, t_noise6};
}

        
export default class Map {
    seed: number = -1;
    spacing: number;
    precomputed: PrecalculatedNoise;
    mountainJaggedness: number = -Infinity;
    windAngleDeg: number = Infinity;
    t_elevation: Float32Array;
    r_elevation: Float32Array;
    r_humidity: Float32Array;
    t_moisture: Float32Array;
    r_rainfall: Float32Array;
    t_downslope_s: Int32Array;
    order_t: Int32Array;
    t_flow: Float32Array;
    s_flow: Float32Array;
    wind_order_r: Int32Array;
    r_wind_sort: Float32Array;
    t_mountain_distance: Float32Array;
    
    constructor (public mesh: Mesh, public peaks_t: number[], param: any) {
        this.spacing = param.spacing;
        this.t_elevation = new Float32Array(mesh.numTriangles);
        this.r_elevation = new Float32Array(mesh.numRegions);
        this.r_humidity = new Float32Array(mesh.numRegions);
        this.t_moisture = new Float32Array(mesh.numTriangles);
        this.r_rainfall = new Float32Array(mesh.numRegions);
        this.t_downslope_s = new Int32Array(mesh.numTriangles);
        this.order_t = new Int32Array(mesh.numTriangles);
        this.t_flow = new Float32Array(mesh.numTriangles);
        this.s_flow = new Float32Array(mesh.numSides);
        this.wind_order_r = new Int32Array(mesh.numRegions);
        this.r_wind_sort = new Float32Array(mesh.numRegions);
        this.t_mountain_distance = new Float32Array(mesh.numTriangles);
    }

    assignTriangleElevation(elevationParam, constraints) {
        let {mesh, t_elevation, t_mountain_distance, precomputed} = this;
        let {numTriangles, numSolidTriangles} = mesh;

        // Assign elevations to triangles TODO: separate message,
        // store the interpolated values in an array, or maybe for
        // each painted cell store which triangle elevations have to
        // be updated, so that we don't have to recalculate the entire
        // map's interpolated values each time (involves copying 50k
        // floats instead of 16k floats), or maybe send a message with
        // the bounding box of the painted area
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
            let e = constraintAt(mesh.x_of_t(t)/1000, mesh.y_of_t(t)/1000);
            // TODO: e*e*e*e seems too steep for this, as I want this
            // to apply mostly at the original coastlines and not
            // elsewhere
            t_elevation[t] = e + elevationParam.noisy_coastlines * (1 - e*e*e*e) * (precomputed.t_noise4[t] + precomputed.t_noise5[t]/2 + precomputed.t_noise6[t]/4);
        }
        
        // For land triangles, mix hill and mountain terrain together
        const mountain_slope = mountain.slope,
              mountain_sharpness = Math.pow(2, elevationParam.mountain_sharpness),
              {t_noise0, t_noise1, t_noise2, t_noise4} = precomputed;
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
                // TODO: precompute eh, em per triangle
                let noisiness = 1.0 - 0.5 * (1 + t_noise0[t]);
                let eh = (1 + noisiness * t_noise4[t] + (1 - noisiness) * t_noise2[t]) * elevationParam.hill_height;
                if (eh < 0.01) { eh = 0.01; }
                let em = 1 - mountain_slope/mountain_sharpness * t_mountain_distance[t];
                if (em < 0.01) { em = 0.01; }
                let weight = e * e;
                e = (1-weight) * eh + weight * em;
            } else {
                /* Add noise to make it more interesting. */
                e *= elevationParam.ocean_depth + t_noise1[t];
            }
            if (e < -1.0) { e = -1.0; }
            if (e > +1.0) { e = +1.0; }
            t_elevation[t] = e;
        }
    }
    
    assignRegionElevation() {
        let {mesh, t_elevation, r_elevation} = this;
        let {numRegions, _s_of_r, _halfedges} = mesh;
        for (let r = 0; r < numRegions; r++) {
            let count = 0, e = 0, water = false;
            const s0 = _s_of_r[r];
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

    assignElevation(elevationParam, constraints) {
        if (this.seed !== elevationParam.seed || this.mountainJaggedness !== elevationParam.mountain_jagged) {
            this.mountainJaggedness = elevationParam.mountain_jagged;
            calculateMountainDistance(
                this.mesh, this.peaks_t, this.spacing,
                this.mountainJaggedness, makeRandFloat(elevationParam.seed),
                this.t_mountain_distance
            );
        }
        
        if (this.seed !== elevationParam.seed) {
            // TODO: function should reuse existing arrays
            this.seed = elevationParam.seed;
            this.precomputed = precalculateNoise(makeRandFloat(elevationParam.seed), this.mesh);
        }
        
        this.assignTriangleElevation(elevationParam, constraints);
        this.assignRegionElevation();
    }

    assignRainfall(biomesParam) {
        const {mesh, wind_order_r, r_wind_sort, r_humidity, r_rainfall, r_elevation} = this;
        const {numRegions, _s_of_r, _halfedges} = mesh;

        if (biomesParam.wind_angle_deg != this.windAngleDeg) {
            this.windAngleDeg = biomesParam.wind_angle_deg;
            const windAngleRad = Math.PI / 180 * this.windAngleDeg;
            const windAngleVec = [Math.cos(windAngleRad), Math.sin(windAngleRad)];
            for (let r = 0; r < numRegions; r++) {
                wind_order_r[r] = r;
                r_wind_sort[r] = mesh.x_of_r(r) * windAngleVec[0] + mesh.y_of_r(r) * windAngleVec[1];
            }
            wind_order_r.sort((r1, r2) => r_wind_sort[r1] - r_wind_sort[r2]);
        }

        for (let r of wind_order_r) {
            let count = 0, sum = 0.0;
            let s0 = _s_of_r[r], incoming = s0;
            do {
                let neighbor_r = mesh.r_begin_s(incoming);
                if (r_wind_sort[neighbor_r] < r_wind_sort[r]) {
                    count++;
                    sum += r_humidity[neighbor_r];
                }
                let outgoing = mesh.s_next_s(incoming);
                incoming = _halfedges[outgoing];
            } while (incoming !== s0);
            
            let humidity = 0.0, rainfall = 0.0;
            if (count > 0) {
                humidity = sum / count;
                rainfall += biomesParam.raininess * humidity;
            }
            if (mesh.is_boundary_r(r)) {
                humidity = 1.0;
            }
            if (r_elevation[r] < 0.0) {
                let evaporation = biomesParam.evaporation * -r_elevation[r];
                humidity += evaporation;
            }
            if (humidity > 1.0 - r_elevation[r]) {
                let orographicRainfall = biomesParam.rain_shadow * (humidity - (1.0 - r_elevation[r]));
                rainfall += biomesParam.raininess * orographicRainfall;
                humidity -= orographicRainfall;
            }
            r_rainfall[r] = rainfall;
            r_humidity[r] = humidity;
        }
    }

    assignRivers(riversParam) {
        let {mesh, t_moisture, r_rainfall, t_elevation, t_downslope_s, order_t, t_flow, s_flow} = this;
        assignDownslope(mesh, t_elevation, t_downslope_s, order_t);
        assignMoisture(mesh, r_rainfall, t_moisture);
        assignFlow(mesh, riversParam, order_t, t_elevation, t_moisture, t_downslope_s, t_flow, s_flow);
    }
        
}


let queue = new FlatQueue<number>();
/**
 * Use prioritized graph exploration to assign river flow direction
 *
 * order_t will be pre-order in which the graph was traversed, so
 * roots of the tree always get visited before leaves; use reverse to
 * visit leaves before roots
 */
function assignDownslope(mesh: Mesh, t_elevation: Float32Array, /* out */ t_downslope_s: Int32Array, /* out */ order_t: Int32Array) {
    /* Use a priority queue, starting with the ocean triangles and
     * moving upwards using elevation as the priority, to visit all
     * the land triangles */
    let {numTriangles} = mesh,
        queue_in = 0;
    t_downslope_s.fill(-999);
    /* Part 1: non-shallow ocean triangles get downslope assigned to the lowest neighbor */
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] < -0.1) {
            let best_s = -1, best_e = t_elevation[t];
            for (let j = 0; j < 3; j++) {
                let s = 3 * t + j,
                    e = t_elevation[mesh.t_outer_s(s)];
                if (e < best_e) {
                    best_e = e;
                    best_s = s;
                }
            }
            order_t[queue_in++] = t;
            t_downslope_s[t] = best_s;
            queue.push(t, t_elevation[t]);
        }
    }
    /* Part 2: land triangles get visited in elevation priority */
    for (let queue_out = 0; queue_out < numTriangles; queue_out++) {
        let current_t = queue.pop();
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.t_outer_s(s); // uphill from current_t
            if (t_downslope_s[neighbor_t] === -999) {
                t_downslope_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
                queue.push(neighbor_t, t_elevation[neighbor_t]);
            }
        }
    }
}


function assignMoisture(mesh: Mesh, r_rainfall: Float32Array, /* out */ t_moisture: Float32Array) {
    const {numTriangles} = mesh;
    for (let t = 0; t < numTriangles; t++) {
        let moisture = 0.0;
        for (let i = 0; i < 3; i++) {
            let s = 3 * t + i,
                r = mesh.r_begin_s(s);
            moisture += r_rainfall[r] / 3;
        }
        t_moisture[t] = moisture;
    }
}


function assignFlow(mesh: Mesh, riversParam: any, order_t: Int32Array, t_elevation: Float32Array, t_moisture: Float32Array, t_downslope_s: Int32Array, /* out */ t_flow: Float32Array, /* out */ s_flow: Float32Array) {
    let {numTriangles, _halfedges} = mesh;
    s_flow.fill(0);
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] >= 0.0) {
            t_flow[t] = riversParam.flow * t_moisture[t] * t_moisture[t];
        } else {
            t_flow[t] = 0;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        let tributary_t = order_t[i];
        let flow_s = t_downslope_s[tributary_t];
        let trunk_t = (_halfedges[flow_s] / 3) | 0;
        if (flow_s >= 0) {
            t_flow[trunk_t] += t_flow[tributary_t];
            s_flow[flow_s] += t_flow[tributary_t]; // TODO: s_flow[t_downslope_s[t]] === t_flow[t]; redundant?
            if (t_elevation[trunk_t] > t_elevation[tributary_t] && t_elevation[tributary_t] >= 0.0) {
                t_elevation[trunk_t] = t_elevation[tributary_t];
            }
        }
    }
}
