/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module allows the user to paint constraints for the map generator
 */
'use strict';

/*
 * The painting interface uses a square array of elevations. As you
 * drag the mouse it will paint filled circles into the elevation map,
 * then send the elevation map to the generator to produce the output.
 */

import {createNoise4D} from 'simplex-noise';
import {makeRandFloat} from '@redblobgames/prng';

const CANVAS_SIZE = 128;

const currentStroke = {
    /* only thing that matters is the current position */
    x: 0,
    y: 0,
};


/* The elevation is -1.0 to 0.0 → water, 0.0 to +1.0 → land */
class Generator {
    seed = 0;
    island = 0;
    userHasPainted = false;
    elevation: Float32Array;
    
    constructor () {
        this.elevation = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);
    }

    setElevationParam(elevationParam) {
        if (   elevationParam.seed   !== this.seed
            || elevationParam.island !== this.island) {
            this.seed   = elevationParam.seed;
            this.island = elevationParam.island;
            this.generate();
        }
    }
    
    /** Use a noise function to determine the shape */
    generate() {
        const {elevation, island} = this;
        const noise4D = createNoise4D(makeRandFloat(this.seed))
        const noise2D = (x: number, y: number) => noise4D(x, y, currentStroke.x, currentStroke.y);
        const persistence = 1/2;
        const amplitudes = Array.from({length: 5}, (_, octave) => Math.pow(persistence, octave));

        function fbm_noise(nx, ny) {
            let sum = 0, sumOfAmplitudes = 0;
            for (let octave = 0; octave < amplitudes.length; octave++) {
                let frequency = 1 << octave;
                sum += amplitudes[octave] * noise2D(nx * frequency, ny * frequency);
                sumOfAmplitudes += amplitudes[octave];
            }
            return sum / sumOfAmplitudes;
        }

        for (let y = 0; y < CANVAS_SIZE; y++) {
            for (let x = 0; x < CANVAS_SIZE; x++) {
                let p = y * CANVAS_SIZE + x;
                let nx = 2 * x/CANVAS_SIZE - 1,
                    ny = 2 * y/CANVAS_SIZE - 1;
                let distance = Math.max(Math.abs(nx), Math.abs(ny));
                let e = 0.5 * (fbm_noise(nx, ny) + island * (0.75 - 2 * distance * distance));
                if (e < -1.0) { e = -1.0; }
                if (e > +1.0) { e = +1.0; }
                elevation[p] = e;
                if (e > 0.0) {
                    let m = (0.5 * noise2D(nx + 30, ny + 50)
                             + 0.5 * noise2D(2*nx + 33, 2*ny + 55));
                    // TODO: make some of these into parameters
                    let mountain = Math.min(1.0, e * 5.0) * (1 - Math.abs(m) / 0.5);
                    if (mountain > 0.0) {
                        elevation[p] = Math.max(e, Math.min(e * 3, mountain));
                    }
                }
            }
        }

        this.userHasPainted = false;
    }
}
let heightMap = new Generator();

let exported = {
    size: CANVAS_SIZE,
    onUpdate: () => {},
    screenToWorldCoords: coords => coords,
    constraints: heightMap.elevation,
    setElevationParam: elevationParam => heightMap.setElevationParam(elevationParam),
    userHasPainted: () => heightMap.userHasPainted,
};


const SIZES = {
    // rate is effect per second
    tiny:   {key: '1', rate: 9, innerRadius: 1.5, outerRadius: 2.5},
    small:  {key: '2', rate: 8, innerRadius: 2, outerRadius: 6},
    medium: {key: '3', rate: 5, innerRadius: 5, outerRadius: 10},
    large:  {key: '4', rate: 3, innerRadius: 10, outerRadius: 16},
};

const TOOLS = {
    ocean:    {elevation: -0.25},
    shallow:  {elevation: -0.05},
    valley:   {elevation: +0.05},
    mountain: {elevation: +1.0},
};

let currentTool = 'mountain';
let currentSize = 'small';

function displayCurrentTool() {
    const className = 'current-control';
    for (let c of document.querySelectorAll("."+className)) {
        c.classList.remove(className);
    }
    document.getElementById(currentTool).classList.add(className);
    document.getElementById(currentSize).classList.add(className);
}

const controls: [string, string, () => void][] = [
    ['1', "tiny",     () => { currentSize = 'tiny'; }],
    ['2', "small",    () => { currentSize = 'small'; }],
    ['3', "medium",   () => { currentSize = 'medium'; }],
    ['4', "large",    () => { currentSize = 'large'; }],
    ['q', "ocean",    () => { currentTool = 'ocean'; }],
    ['w', "shallow",  () => { currentTool = 'shallow'; }],
    ['e', "valley",   () => { currentTool = 'valley'; }],
    ['r', "mountain", () => { currentTool = 'mountain'; }],
];

window.addEventListener('keydown', e => {
    for (let control of controls) {
        if (e.key === control[0]) { control[2](); displayCurrentTool(); }
    }
});

for (let control of controls) {
    document.getElementById(control[1]).addEventListener('click', () => { control[2](); displayCurrentTool(); } );
}
displayCurrentTool();


function setUpPaintEventHandling() {
    const el = document.getElementById('mapgen4');
    let dragging = false;

    function start(event: PointerEvent) {
        if (event.button !== 0) return; // left button only
        el.setPointerCapture(event.pointerId);

        dragging = true;
        move(event);
    }

    function end(_event) {
        dragging = false;
    }

    function move(event: PointerEvent) {
        // We're going to run this whether we're in dragging (mouse down) or not (mouse up).
        // The expectation is that mouse interaction will use mouse-up and touch interaction
        // will be mouse-down.
        const bounds = el.getBoundingClientRect();
        let coords = [
            (event.x - bounds.left) / bounds.width,
            (event.y - bounds.top) / bounds.height,
        ];
        coords = exported.screenToWorldCoords(coords);
        if (0 <= coords[0] && coords[0] <= 1
            && 0 <= coords[1] && coords[1] <= 1) {
            currentStroke.x = 3 * (coords[0] - 0.5);
            currentStroke.y = 3 * (coords[1] - 0.5);
            heightMap.userHasPainted = true;
            heightMap.generate();
            exported.onUpdate();
        }
    }

    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointermove', move)
    el.addEventListener('touchstart', (e) => e.preventDefault()); // prevent scroll
}
setUpPaintEventHandling();


export default exported;
