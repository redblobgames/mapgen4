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

import param from "./config.js";
import {makeMesh} from "./mesh.ts";
import Painting from "./painting.ts";
import Renderer from "./render.ts";
import type {Mesh} from "./types.d.ts";



const initialParams = {
    elevation: [
        ['seed', 187, 1, 1 << 30],
        ['island', 0.5, 0, 1],
        ['noisy_coastlines', 0.01, 0, 0.1],
        ['hill_height', 0.02, 0, 0.1],
        ['mountain_jagged', 0, 0, 1],
        ['mountain_sharpness', 9.8, 9.1, 12.5],
        ['ocean_depth', 1.5, 1, 3],
    ],
    biomes: [
        ['wind_angle_deg', 0, 0, 360],
        ['raininess', 0.9, 0, 2],
        ['rain_shadow', 0.5, 0.1, 2],
        ['evaporation', 0.5, 0, 1],
    ],
    rivers: [
        ['lg_min_flow', 2.7, -5, 5],
        ['lg_river_width', -2.7, -5, 5],
        ['flow', 0.2, 0, 1],
    ],
    render: [
        ['zoom', 100/480, 100/1000, 100/50],
        ['x', 500, 0, 1000],
        ['y', 500, 0, 1000],
        ['light_angle_deg', 80, 0, 360],
        ['slope', 2, 0, 5],
        ['flat', 2.5, 0, 5],
        ['ambient', 0.25, 0, 1],
        ['overhead', 30, 0, 60],
        ['tilt_deg', 0, 0, 90],
        ['rotate_deg', 0, -180, 180],
        ['mountain_height', 50, 0, 250],
        ['outline_depth', 1, 0, 2],
        ['outline_strength', 15, 0, 30],
        ['outline_threshold', 0, 0, 100],
        ['outline_coast', 0, 0, 1],
        ['outline_water', 10.0, 0, 20], // things start going wrong when this is high
        ['biome_colors', 1, 0, 1],
    ],
};

    
/**
 * Starts the UI, once the mesh has been loaded in.
 */
function main({mesh, t_peaks}: { mesh: Mesh; t_peaks: number[]; }) {
    let render = new Renderer(mesh);

    /* set initial parameters */
    for (let phase of ['elevation', 'biomes', 'rivers', 'render']) {
        const container = document.createElement('div');
        const header = document.createElement('h3');
        header.appendChild(document.createTextNode(phase));
        container.appendChild(header);
        document.getElementById('sliders').appendChild(container);
        for (let [name, initialValue, min, max] of initialParams[phase]) {
            const step = name === 'seed'? 1 : 0.001;
            param[phase][name] = initialValue;

            let span = document.createElement('span');
            span.appendChild(document.createTextNode(name));
            
            let slider = document.createElement('input');
            slider.setAttribute('type', name === 'seed'? 'number' : 'range');
            slider.setAttribute('min', min);
            slider.setAttribute('max', max);
            slider.setAttribute('step', step.toString());
            slider.addEventListener('input', _event => {
                param[phase][name] = slider.valueAsNumber;
                requestAnimationFrame(() => {
                    if (phase == 'render') { redraw(); }
                    else { generate(); }
                });
            });

            /* improve slider behavior on iOS */
            function handleTouch(event: TouchEvent) {
                let rect = slider.getBoundingClientRect();
                let value = (event.changedTouches[0].clientX - rect.left) / rect.width;
                value = min + value * (max - min);
                value = Math.round(value / step) * step;
                if (value < min) { value = min; }
                if (value > max) { value = max; }
                slider.value = value.toString();
                slider.dispatchEvent(new Event('input'));
                event.preventDefault();
                event.stopPropagation();
            };
            slider.addEventListener('touchmove', handleTouch);
            slider.addEventListener('touchstart', handleTouch);

            let label = document.createElement('label');
            label.setAttribute('id', `slider-${name}`);
            label.appendChild(span);
            label.appendChild(slider);

            container.appendChild(label);
            slider.value = initialValue;
        }
    }
    
    function redraw() {
        render.updateView(param.render);
    }

    /* Ask render module to copy WebGL into Canvas */
    function download() {
        render.screenshotCallback = () => {
            let a = document.createElement('a');
            render.screenshotCanvas.toBlob(blob => {
                // TODO: Firefox doesn't seem to allow a.click() to
                // download; is it everyone or just my setup?
                a.href = URL.createObjectURL(blob);
                a.setAttribute('download', `mapgen4-${param.elevation.seed}.png`);
                a.click();
            });
        };
        render.updateView(param.render);
    }
    
    Painting.screenToWorldCoords = (coords) => {
        let out = render.screenToWorld(coords);
        return [out[0] / 1000, out[1] / 1000];
    };

    Painting.onUpdate = () => {
        generate();
    };

    const worker = new window.Worker("build/_worker.js");
    let working = false;
    let workRequested = false;
    let elapsedTimeHistory = [];

    worker.addEventListener('messageerror', event => {
        console.log("WORKER ERROR", event);
    });
    
    worker.addEventListener('message', event => {
        working = false;
        let {elapsed, numRiverTriangles, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;
        elapsedTimeHistory.push(elapsed | 0);
        if (elapsedTimeHistory.length > 10) { elapsedTimeHistory.splice(0, 1); }
        const timingDiv = document.getElementById('timing');
        if (timingDiv) { timingDiv.innerText = `${elapsedTimeHistory.join(' ')} milliseconds`; }
        render.quad_elements = new Int32Array(quad_elements_buffer);
        render.a_quad_em = new Float32Array(a_quad_em_buffer);
        render.a_river_xyuv = new Float32Array(a_river_xyuv_buffer);
        render.numRiverTriangles = numRiverTriangles;
        render.updateMap();
        redraw();
        if (workRequested) {
            requestAnimationFrame(() => {
                workRequested = false;
                generate();
            });
        }
    });

    function updateUI() {
        let userHasPainted = Painting.userHasPainted();
        (document.querySelector("#slider-seed input") as HTMLInputElement).disabled = userHasPainted;
        (document.querySelector("#slider-island input") as HTMLInputElement).disabled = userHasPainted;
        (document.querySelector("#button-reset") as HTMLInputElement).disabled = !userHasPainted;
    }
    
    function generate() {
        if (!working) {
            working = true;
            Painting.setElevationParam(param.elevation);
            updateUI();
            worker.postMessage({
                param,
                constraints: {
                    size: Painting.size,
                    constraints: Painting.constraints,
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
        } else {
            workRequested = true;
        }
    }

    worker.postMessage({mesh, t_peaks, param});
    generate();

    const downloadButton = document.getElementById('button-download');
    if (downloadButton) downloadButton.addEventListener('click', download);
}

makeMesh().then(main);
