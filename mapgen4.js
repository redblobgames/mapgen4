/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
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

/* global dat */

const WebWorkify  = require('webworkify');
const DualMesh    = require('@redblobgames/dual-mesh');
const MeshBuilder = require('@redblobgames/dual-mesh/create');
const Painting    = require('./painting');
const Map         = require('./map');
const Geometry    = require('./geometry');
const Render      = require('./render');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');


let param = {
    seed: 183,   // 102, 181, 184, 185, 187, 505, 507, 2033
    spacing: 5,
};

(function readSeedFromUrl() {
    let match = (window.location.search || "").match(/\?seed=([0-9]+)/);
    if (match) {
        param.seed = parseFloat(match[1]) | 0;
    }
})();



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


let meshb = new MeshBuilder({boundarySpacing: param.spacing * 1.5});
console.time('points');
meshb.addPoints(jitteredHexagonGrid(1.5 * param.spacing * Math.sqrt(1 - 0.3), 0.3, makeRandFloat(12345)));
console.timeEnd('points');

console.time('mesh-init');
let mesh = meshb.create(true);
console.timeEnd('mesh-init');
console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

console.time('s_length');
mesh.s_length = new Float32Array(mesh.numSides);
for (let s = 0; s < mesh.numSides; s++) {
    let t1 = mesh.s_inner_t(s),
        t2 = mesh.s_outer_t(s);
    let dx = mesh.t_x(t1) - mesh.t_x(t2),
        dy = mesh.t_y(t1) - mesh.t_y(t2);
    mesh.s_length[s] =Math.sqrt(dx*dx + dy*dy);
}
console.timeEnd('s_length');

console.time('static allocation');
let render = new Render.Renderer(mesh);
console.timeEnd('static allocation');

const gparam = Render.param;
if (document.location.hostname==='localhost') {
    /* Only inject this locally because it slows things down */
    let G = new dat.GUI();
    G.close();
    G.add(gparam, 'distance', 100, 1000);
    G.add(gparam, 'x', 0, 1000);
    G.add(gparam, 'y', 0, 1000);
    G.add(gparam.drape, 'light_angle_deg', 0, 360);
    G.add(gparam.drape, 'slope', 0, 5);
    G.add(gparam.drape, 'flat', 0, 5);
    G.add(gparam.drape, 'c', 0, 1);
    G.add(gparam.drape, 'd', 0, 40);
    G.add(gparam.drape, 'mix', 0, 2);
    G.add(gparam.drape, 'rotate_x_deg', -360, 360);
    G.add(gparam.drape, 'rotate_z_deg', -360, 360);
    G.add(gparam.drape, 'scale_z', 0, 2);
    G.add(gparam.drape, 'outline_depth', 0, 5);
    G.add(gparam.drape, 'outline_strength', 0, 30);
    G.add(gparam.drape, 'outline_threshold', 0, 100);
    for (let c of G.__controllers) c.listen().onChange(redraw);
}

function redraw() {
    // TODO: this should go inside requestAnimationFrame, and it shouldn't trigger multiple times
    render.updateView();
}

Painting.onUpdate = () => {
    generate();
};

const worker = WebWorkify(require('./worker.js'));
let working = false;

worker.addEventListener('message', event => {
    working = false;
    let {elapsed, numRiverTriangles, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;
    document.getElementById('timing').innerText = `${elapsed.toFixed(2)} milliseconds`;
    render.quad_elements = new Int32Array(quad_elements_buffer);
    render.a_quad_em = new Float32Array(a_quad_em_buffer);
    render.a_river_xyuv = new Float32Array(a_river_xyuv_buffer);
    render.numRiverTriangles = numRiverTriangles;
    render.updateMap();
    redraw();
});

function generate() {
    if (!working) {
        working = true;
        worker.postMessage({
            constraints: {
                size: Painting.size,
                constraints: Painting.constraints,
                OCEAN: Painting.OCEAN,
                VALLEY: Painting.VALLEY,
                MOUNTAIN: Painting.MOUNTAIN,
            },
            quad_elements_buffer: render.quad_elements.buffer,
            a_quad_em_buffer: render.a_quad_em.buffer,
            a_river_xyuv_buffer: render.a_river_xyuv.buffer,
        }, [
            render.quad_elements.buffer,
            render.a_quad_em.buffer,
            render.a_river_xyuv.buffer,
        ]
        );
    }
}

worker.postMessage({mesh, param});
generate();
