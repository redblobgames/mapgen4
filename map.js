/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

const SimplexNoise = require('simplex-noise');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');

let PEAKS = (() => {
    const spacing = 0.07;
    let result = [];
    let offset = 0;
    for (let y = -0.9; y <= 0.9; y += spacing) {
        offset = offset > 0? 0 : spacing/2;
        for (let x = -0.9 + offset; x <= 0.9; x += spacing) {
            result.push({
                x: x + (Math.random() - Math.random()) * spacing,
                y: y + (Math.random() - Math.random()) * spacing,
                zm: 1.0 + (Math.random() - Math.random()) * 0.2,
                zh: 1.0 + (Math.random() - Math.random()) * 0.2,
                wm: 20 + 3 * y,
                wh: 40 + 10 * y,
            });
        }
    }
    return result;
})();

function elevation(noise, x, y) {
    let dx = (x-500)/500, dy = (y-500)/500;
    let base = noise.noise2D(dx, dy);
    base = (0.75 * base
             + 0.5 * noise.noise2D(dx*2 + 5, dy*2 + 5)
             + 0.125 * noise.noise2D(dx*4 + 7, dy*4 + 7)
             + 0.0625 * noise.noise2D(dx*8 + 9, dy*8 + 9));

    function mountain(x, y, w) {
        let d = Math.sqrt((x - dx) * (x - dx) + (y - dy) * (y - dy));
        return 1 - w * d;
    }
    function hill(x, y, w) {
        let d2 = (x - dx) * (x - dx) + (y - dy) * (y - dy);
        return Math.max(0, Math.pow(Math.exp(-d2*3000), 0.5) - 0.3);
    }
    let e = base;
    let eh = 0;
    let em = 0;
    if (base > 0) {
        for (let {x, y, zm, zh, wm, wh} of PEAKS) {
            em = Math.max(em, zm * mountain(x, y, wm));
            eh = Math.max(eh, zh * hill(x, y, wh));
        }

        // now use base to decide how much of eh, em to mix in. At base = 0 we mix in none of it. At base = 0.5 we mix in hills. At base = 1.0 we mix in mountains.
        let w0 = 2,
            wm = 2 * base * base,
            wh = 0.5 * (0.5 - Math.abs(0.5 - base));
        e = (w0 * base + wh * eh + wm * em) / (w0 + wh + wm);
    }
    
    return e;
    /*
    // base = (1.0 - Math.abs(base) * 2.0) * Math.pow(Math.abs(noise.noise2D(1.5*dx + 10, 1.5*dy + 10)), 0.125);
    // TODO: use one noise field to calculate land/water and another to calculate elevation
    // TODO: calculate distance from coast (multiplied by param.spacing)
    // TODO: mix(distance_from_coast / 20, basenoise, smoothstep(0, 20, distance_from_coast))
    let e = (0.5 * base
             + 0.25 * noise.noise2D(dx*2 + 5, dy*2 + 5)
             + 0.125 * noise.noise2D(dx*4 + 7, dy*4 + 7)
             + 0.0625 * noise.noise2D(dx*8 + 9, dy*8 + 9));

    let step = (base < 0.5)? 0 : (base > 0.7)? 1 : (base - 0.5)/0.2;
    e += step * 0.5 * (Math.abs(noise.noise2D(dx*3 - 3, dy*3 - 3)) * base) * Math.abs(noise.noise2D(dx*32 + 9, dy*32 + 9)); // bumpier mountains
    
    if (e < -1.0) { e = -1.0; }
    if (e > +1.0) { e = +1.0; }
    return e;
*/
}


class Map {
    constructor (mesh, param) {
        console.time('map-alloc');
        this.mesh = mesh;
        this.noise = new SimplexNoise(makeRandFloat(param.seed));
        this.t_elevation = new Float32Array(mesh.numTriangles);
        this.r_elevation = new Float32Array(mesh.numRegions);
        this.r_moisture = new Float32Array(mesh.numRegions);
        this.r_water = new Int8Array(mesh.numRegions);
        this.r_ocean = new Int8Array(mesh.numRegions);
        this.t_downslope_s = new Int32Array(mesh.numTriangles);
        this.order_t = new Int32Array(mesh.numTriangles);
        this.t_flow = new Float32Array(mesh.numTriangles);
        this.s_flow = new Float32Array(mesh.numSides);
        this.seeds_t = [];
        console.timeEnd('map-alloc');
    }

    assignElevation() {
        let {mesh, noise, t_elevation, r_elevation, r_moisture, r_water, r_ocean, seeds_t} = this;
        console.time('map-elevation-1');
        seeds_t.splice(0);
        for (let t = 0; t < mesh.numTriangles; t++) {
            let e = elevation(noise, mesh.t_x(t), mesh.t_y(t), t);
            t_elevation[t] = e;
            if (e < 0 && mesh.t_ghost(t)) { seeds_t.push(t); }
        }
        console.timeEnd('map-elevation-1');
        console.time('map-elevation-2');
        let out_t = [];
        for (let r = 0; r < mesh.numRegions; r++) {
            let e = 0, water = false;
            mesh.r_circulate_t(out_t, r);
            for (let t of out_t) { e += t_elevation[t]; water = water || t_elevation[t] < 0.0; }
            e /= out_t.length;
            if (water && e >= 0) { e = -0.001; }
            r_elevation[r] = e;
            r_moisture[r] = 0.8-Math.sqrt(Math.abs(e));
            r_water[r] = e < 0;
            r_ocean[r] = e < 0;
        }
        console.timeEnd('map-elevation-2');
    }

    assignRivers() {
        let {mesh, seeds_t, t_elevation, t_downslope_s, order_t, t_flow, s_flow} = this;
        console.time('map-rivers-1');
        biased_search(mesh, seeds_t, t_elevation, t_downslope_s, order_t);
        console.timeEnd('map-rivers-1');
        console.time('map-rivers-2');
        assign_flow(mesh, order_t, t_elevation, t_downslope_s, t_flow, s_flow);
        console.timeEnd('map-rivers-2');
    }
        
}


function biased_search(mesh, seeds_t, t_priority, /* out */ t_downflow_s, /* out */ order_t) {
    let out_s = [];
    t_downflow_s.fill(-999);
    seeds_t.forEach(t => { t_downflow_s[t] = -1; });
    order_t.set(seeds_t);
    for (let queue_in = seeds_t.length, queue_out = 0; queue_out < mesh.numTriangles; queue_out++) {
        if (queue_out >= seeds_t.length) {
            // Shuffle some elements of the queue to prefer values with lower t_priority.
            // Higher constants make it evaluate more elements, and rivers will meander less,
            // but also follow the contours more closely, which should result in fewer canyons.
            // TODO: try a threshold on whether to swap (should allow more meandering in valleys but less in mountains)
            // TODO: this step is fragile and may behave badly when updating small parts of the map
            let pivot_step = Math.ceil((queue_in-queue_out) / 5);
            for (let pivot = queue_in - 1; pivot > queue_out; pivot = pivot - pivot_step) {
                if (t_priority[order_t[pivot]] < t_priority[order_t[queue_out]]) {
                    let swap = order_t[pivot];
                    order_t[pivot] = order_t[queue_out];
                    order_t[queue_out] = swap;
                }
            }
        }
        
        let current_t = order_t[queue_out];
        mesh.t_circulate_s(out_s, current_t);
        for (let s of out_s) {
            let neighbor_t = mesh.s_outer_t(s); // uphill from current_t
            if (t_downflow_s[neighbor_t] === -999) {
                t_downflow_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
            }
        }
    }
    // order_t is the visit pre-order, so roots of the tree always get
    // visited before leaves; we can use this in reverse to visit
    // leaves before roots
}


function assign_flow(mesh, order_t, t_elevation, t_downflow_s, /* out */ t_flow, /* out */ s_flow) {
    t_flow.fill(0);
    s_flow.fill(0);
    for (let t = 0; t < mesh.numTriangles; t++) {
        if (t_elevation[t] > 0) {
            t_flow[t] = 1;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        // t1 is the tributary and t2 is the trunk
        let t1 = order_t[i];
        let s = t_downflow_s[t1];
        let t2 = mesh.s_outer_t(s);
        if (s >= 0 && t_elevation[t2] > 0) {
            t_flow[t2] += t_flow[t1];
            s_flow[s] += t_flow[t1];
            if (t_elevation[t2] > t_elevation[t1]) {
                t_elevation[t2] = t_elevation[t1];
            }
        }
    }
}


module.exports = Map;
