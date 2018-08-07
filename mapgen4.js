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
const DualMesh =     require('@redblobgames/dual-mesh');
const MeshBuilder =  require('@redblobgames/dual-mesh/create');
const DrawWater =    require('./draw-water');
const Render =       require('./render');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');


let param = {
    seed: 180,   // 102, 181, 184, 185, 187, 505, 507
    spacing: 5,
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


class Map {
    constructor (mesh) {
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
        function elevation(x, y) {
            let dx = (x-500)/500, dy = (y-500)/500;
            let e = (0.5 * noise.noise2D(dx, dy)
                     + 0.25 * noise.noise2D(dx*2 + 5, dy*2 + 5)
                     + 0.125 * noise.noise2D(dx*4 + 7, dy*4 + 7)
                     + 0.0625 * noise.noise2D(dx*8 + 9, dy*8 + 9));
            e += 0.2 * (noise.noise2D(dx*3 - 3, dy*3 - 3) * e) * noise.noise2D(dx*32 + 9, dy*32 + 9); // bumpier mountains
            if (e < -1.0) { e = -1.0; }
            if (e > +1.0) { e = +1.0; }
            return e;
        }
        seeds_t.splice(0);
        for (let t = 0; t < mesh.numTriangles; t++) {
            let e = elevation(mesh.t_x(t), mesh.t_y(t));
            t_elevation[t] = e;
            if (e < 0 && mesh.t_ghost(t)) { seeds_t.push(t); }
        }
        console.timeEnd('map-elevation-1');
        console.time('map-elevation-2');
        for (let r = 0; r < mesh.numRegions; r++) {
            let e = elevation(mesh.r_x(r), mesh.r_y(r));
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


function jitteredHexagonGrid(spacing, discardFraction, randFloat) {
    const dr = spacing/1.5;
    let points = [];
    let offset = 0;
    for (let y = spacing/2; y < 1000-spacing/2; y += spacing * 3/4) {
        offset = (offset === 0)? spacing/2 : 0;
        for (let x = offset + spacing/2; x < 1000-spacing/2; x += spacing) {
            if (randFloat() < discardFraction) continue;
            let r = dr * Math.sqrt(Math.abs(randFloat()));
            let a = Math.PI * randFloat();
            let dx = r * Math.cos(a);
            let dy = r * Math.sin(a);
            points.push([x + dx, y + dy]);
        }
    }
    return points;
}


function draw() {
    let meshb = new MeshBuilder({boundarySpacing: param.spacing * 1.5});
    console.time('points');
    meshb.addPoints(jitteredHexagonGrid(1.5 * param.spacing * Math.sqrt(1 - 0.3), 0.3, makeRandFloat(12345)));
    console.timeEnd('points');
    
    console.time('mesh-init');
    let mesh = meshb.create(true);
    console.timeEnd('mesh-init');

    Render.setup(mesh);
    
    let map = new Map(mesh);

    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    map.assignElevation();
    map.assignRivers();
    
    console.time('canvas-init');
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width / 1000, canvas.height / 1000);
    ctx.clearRect(0, 0, 1000, 1000);
    console.timeEnd('canvas-init');

    console.time('draw-lakes');
    DrawWater.lakes(ctx, map);
    console.timeEnd('draw-lakes');
    
    console.time('draw-rivers');
    DrawWater.rivers(ctx, map, param.spacing);
    console.timeEnd('draw-rivers');

    ctx.restore();
    
    Render.draw(map, canvas);
}


draw();
