/*
 * From http://www.redblobgames.com/maps/mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const SimplexNoise = require('simplex-noise');
const Poisson =      require('poisson-disk-sampling');
const DualMesh =     require('@redblobgames/dual-mesh');
const MeshBuilder =  require('@redblobgames/dual-mesh/create');
const Map =          require('@redblobgames/mapgen2');
const DrawWater =    require('./draw-water');
const Lighting =     require('./lighting');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');


let param = {
    seed: 180,   // 102, 181, 184, 185, 187
    variant: 0,
    spacing: 4,
    temperature: 0,
    rainfall: 0,
    canvasSize: 2000,
};

(function readSeedFromUrl() {
    let match = (window.location.search || "").match(/\?seed=([0-9]+)/);
    if (match) {
        param.seed = parseFloat(match[1]) | 0;
    }
})();

let canvas = document.createElement('canvas');
canvas.width = canvas.height = param.canvasSize;


function biased_search(mesh, seeds_t, t_priority) {
    let t_outflow_s = new Int32Array(mesh.numTriangles);
    let out_s = [];
    t_outflow_s.fill(-999);
    seeds_t.forEach(t => { t_outflow_s[t] = -1; });
    let queue_t = new Int32Array(mesh.numTriangles);
    queue_t.set(seeds_t);
    for (let queue_in = seeds_t.length, queue_out = 0; queue_out < mesh.numTriangles; queue_out++) {
        if (queue_out >= seeds_t.length) {
            // Shuffle some elements of the queue to prefer values with lower t_bias
            let pivot_step = Math.ceil((queue_in-queue_out) / 4);
            for (let pivot = queue_in - 1; pivot > queue_out; pivot = pivot - pivot_step) {
                if (t_priority[queue_t[pivot]] < t_priority[queue_t[queue_out]]) {
                    let swap = queue_t[pivot];
                    queue_t[pivot] = queue_t[queue_out];
                    queue_t[queue_out] = swap;
                }
            }
        }
        
        let current_t = queue_t[queue_out];
        mesh.t_circulate_s(out_s, current_t);
        for (let s of out_s) {
            let neighbor_t = mesh.s_outer_t(s); // uphill from current_t
            if (t_outflow_s[neighbor_t] === -999) {
                t_outflow_s[neighbor_t] = mesh.s_opposite_s(s);
                queue_t[queue_in++] = neighbor_t;
            }
        }
    }
    return {t_outflow_s, order_t: queue_t};
    // queue_t is the visit pre-order, so roots of the tree always get
    // visited before leaves; we can use this in reverse to visit
    // leaves before roots
}

function assign_flow(mesh, order_t, t_elevation, t_outflow_s) {
    let t_flow = new Float32Array(mesh.numTriangles);
    let s_flow = new Float32Array(mesh.numSides);
    for (let t = 0; t < mesh.numTriangles; t++) {
        if (t_elevation[t] > 0) {
            t_flow[t] = 1;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        // t1 is the tributary and t2 is the trunk
        let t1 = order_t[i];
        let s = t_outflow_s[t1];
        let t2 = mesh.s_outer_t(s);
        if (s >= 0 && t_elevation[t2] > 0) {
            t_flow[t2] += t_flow[t1];
            s_flow[s] += t_flow[t1];
            if (t_elevation[t2] > t_elevation[t1]) {
                t_elevation[t2] = t_elevation[t1];
            }
        }
    }
    return {t_flow, s_flow};
}

function assign_downlength(mesh, order_t, t_outflow_s) {
    let t_downlength = new Int16Array(mesh.numTriangles);
    for (let t1 of order_t) {
        let t2 = mesh.s_outer_t(t_outflow_s[t1]);
        t_downlength[t1] = t_downlength[t2] + 1;
    }
    return t_downlength;
}

function draw() {
    console.time('mesh-init');
    // TODO: this step is rather slow, and we could speed it up by pregenerating the points ahead of time and not using the Poisson Disc library
    let mesh = new MeshBuilder({boundarySpacing: param.spacing * 1.5})
        .addPoisson(Poisson, param.spacing, makeRandFloat(12345))
        .create();
    console.timeEnd('mesh-init');

    let map = {mesh};
    let ctx = canvas.getContext('2d');

    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);


    let N = new SimplexNoise(makeRandFloat(param.seed));
    function elevation(x, y) {
        let dx = (x-500)/500, dy = (y-500)/500;
        let e = (0.5 * N.noise2D(dx, dy)
                 + 0.25 * N.noise2D(dx*2 + 5, dy*2 + 5)
                 + 0.125 * N.noise2D(dx*4 + 7, dy*4 + 7)
                 + 0.0625 * N.noise2D(dx*8 + 9, dy*8 + 9));
        e += 0.2 * (N.noise2D(dx*3 - 3, dy*3 - 3) * e) * N.noise2D(dx*32 + 9, dy*32 + 9); // bumpier mountains
        if (e < -1.0) { e = -1.0; }
        if (e > +1.0) { e = +1.0; }
        return e;
    }
    let seeds_t = [];
    map.t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        let e = elevation(mesh.t_x(t), mesh.t_y(t));
        map.t_elevation[t] = e;
        if (e < 0 && mesh.t_ghost(t)) { seeds_t.push(t); }
    }
    map.r_elevation = new Float32Array(mesh.numRegions);
    map.r_moisture = new Float32Array(mesh.numRegions);
    map.r_water = new Int8Array(mesh.numRegions);
    map.r_ocean = new Int8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        let e = elevation(mesh.r_x(r), mesh.r_y(r));
        map.r_elevation[r] = e;
        map.r_moisture[r] = 0.8-Math.sqrt(Math.abs(e));
        map.r_water[r] = e < 0;
        map.r_ocean[r] = e < 0;
    }
    let result = biased_search(mesh, seeds_t, map.t_elevation);
    map.t_downslope_s = result.t_outflow_s;
    let {t_flow, s_flow} = assign_flow(mesh, result.order_t, map.t_elevation, result.t_outflow_s);
    map.s_flow = s_flow;
    map.t_flow = t_flow;
    
    ctx.save();
    ctx.scale(canvas.width / 1000, canvas.height / 1000);
    ctx.clearRect(0, 0, 1000, 1000);

    console.time('draw-lakes');
    DrawWater.lakes(ctx, map);
    console.timeEnd('draw-lakes');
    
    console.time('draw-rivers');
    DrawWater.rivers(ctx, map);
    console.timeEnd('draw-rivers');

    /*
    let t_downlength = assign_downlength(mesh, result.order_t, result.t_outflow_s);
    for (let t = 0; t < mesh.numTriangles; t++) {
        // let hue = (360 * result.order_t.indexOf(t) / mesh.numTriangles) | 0;
        let hue = (2 * t_downlength[t]) % 360;
        ctx.fillStyle = `hsl(${hue},100%,50%)`;
        ctx.fillRect(mesh.t_x(t)-1, mesh.t_y(t)-1, 3, 3);
    }
    */

    ctx.restore();
    
    Lighting.draw(map, canvas);
}


draw();
