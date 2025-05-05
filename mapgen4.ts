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
import type {Mesh} from "./types.d.ts";



const initialParams = {
    elevation: [
        ['seed', 201, 1, 1 << 30],
        ['island', 0.5, 0, 1],
        ['noisy_coastlines', 0.01, 0, 0.1],
        ['hill_height', 0.02, 0, 0.1],
        ['mountain_jagged', 0, 0, 1],
        ['mountain_sharpness', 9.8, 9.1, 12.5],
        ['ocean_depth', 1.5, 1, 3],
    ],
    pathfinding: [
        ['sloped', 2, 0.5, 10],
        ['mountains', 15, 1, 100],
        ['hills', 5, 1, 100],
        ['mode_switch', 3, 1, 10],
        ['speed', 3, 1, 10],
        ['lane_width', 0.4, 0.0, 0.5],
        ['lane_changing', 0.1, 0.0, 0.5],
    ],
    biomes: [
        ['wind_angle_deg', 0, 0, 360],
        ['raininess', 0.9, 0, 2],
        ['rain_shadow', 0.5, 0.1, 2],
        ['evaporation', 0.5, 0, 1],
    ],
    rivers: [
        ['lg_min_flow', 1, -5, 5],
        ['lg_river_width', -2.7, -5, -1],
        ['flow', 0.2, 0, 1],
    ],
};

    
/**
 * Starts the UI, once the mesh has been loaded in.
 */
async function main({mesh, t_peaks}: { mesh: Mesh; t_peaks: number[]; }) {
    /* set initial parameters */
    for (let phase of ['elevation', 'pathfinding', 'biomes', 'rivers']) {
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
                requestAnimationFrame(() => generate())
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
    
    Painting.screenToWorldCoords = (coords) => {
        return coords; // 1:1 mapping in mapgen2; it's only in mapgen4's renderer where it matters
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
        let {elapsed, numRiverTriangles} = event.data;
        elapsedTimeHistory.push(elapsed | 0);
        if (elapsedTimeHistory.length > 10) { elapsedTimeHistory.splice(0, 1); }
        const timingDiv = document.getElementById('timing');
        if (timingDiv) { timingDiv.innerText = `${elapsedTimeHistory.join(' ')} milliseconds`; }
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
                outputBoundingRect: document.querySelector("#map-overlay canvas").getBoundingClientRect(),
            });
        } else {
            workRequested = true;
        }
    }

    const mapIconsConfig = {left: 9, top: 4, filename: "map-icons.png"};
    const mapIconsConfigImage = new Image();
    mapIconsConfigImage.onload = start;
    mapIconsConfigImage.src = mapIconsConfig.filename;

    async function start(_loadEvent) {
        let mapCanvas = (document.querySelector("#map-base canvas") as HTMLCanvasElement).transferControlToOffscreen();
        let overlayCanvas = (document.querySelector("#map-overlay canvas") as HTMLCanvasElement).transferControlToOffscreen();
        let mapIconsBitmap = await createImageBitmap(mapIconsConfigImage);
        worker.postMessage(
            {mesh, t_peaks, param, mapIconsConfig, mapIconsBitmap, mapCanvas, overlayCanvas},
            [mapCanvas, overlayCanvas, mapIconsBitmap]
        );
        generate();
        new ResizeObserver(() => generate()).observe(document.querySelector("#map-overlay canvas"));
    }
}

makeMesh().then(main);
