/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module allows the user to paint constraints for the map generator
 */
'use strict';

/* global makeDraggable */

/*
 * The painting interface uses a square array of elevations. As you
 * drag the mouse it will paint filled circles into the elevation map,
 * then send the elevation map to the generator to produce the output.
 */

const SimplexNoise = require('simplex-noise');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');

const CANVAS_SIZE = 128;

/* The elevation is -1.0 to 0.0 → water, 0.0 to +1.0 → land */
const elevation = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);
const currentStroke = {
    /* elevation before the current paint stroke began */
    previousElevation: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
    /* how long, in milliseconds, was spent painting */
    time: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
    /* maximum strength applied */
    strength: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
};


/** Use a noise function to determine the initial shapes */
function setInitialData() {
    const noise = new SimplexNoise(makeRandFloat(188)); // TODO: seed
    function n(nx, ny) {
        // A bunch of tweaks; TODO: this should be more principled, or parameterized
        let a = noise.noise2D(nx, ny),
            b = noise.noise2D(2*nx + 5, 2*ny + 5),
            c = noise.noise2D(4*nx + 7, 4*ny + 7),
            d = noise.noise2D(8*nx + 9, 8*ny + 9);
        let ia = 1 - Math.abs(a);
        return (0.75 * a + 0.5 * a * b + 0.25 * ia * c + 0.125 * ia * d);
    }

    const warp = 0.2;
    for (let y = 0; y < CANVAS_SIZE; y++) {
        for (let x = 0; x < CANVAS_SIZE; x++) {
            let p = y * CANVAS_SIZE + x;
            let nx = 2 * (x/CANVAS_SIZE - 0.5),
                ny = 2 * (y/CANVAS_SIZE - 0.5);
            let e = 0.5 * (n(nx + n(nx+5, ny)*warp, ny + n(nx, ny+5)*warp) + 0.2);
            if (e < -1.0) { e = -1.0; }
            if (e > +1.0) { e = +1.0; }
            elevation[p] = e;
            if (e > 0.0) {
                let m = noise.noise2D(x/CANVAS_SIZE + 3, y/CANVAS_SIZE + 5);
                let mountain = 1 - Math.abs(m) / 0.5;
                if (mountain > 0.0) {
                    elevation[p] = Math.max(e, Math.min(e * 10, mountain));
                }
            }
        }
    }
}

/** 
 * Paint a circular region
 *
 * @param {{elevation: number}} tool
 * @param {number} x0 - should be 0 to 1
 * @param {number} y0 - should be 0 to 1
 * @param {{innerRadius: number, outerRadius: number, rate: number}} size
 * @param {number} deltaTimeInMs
 */
function paintAt(tool, x0, y0, size, deltaTimeInMs) {
    /* This has two effects: first time you click the mouse it has a
     * strong effect, and it also limits the amount in case you
     * pause */
    deltaTimeInMs = Math.min(100, deltaTimeInMs);

    let newElevation = tool.elevation;
    let {innerRadius, outerRadius, rate} = size;
    let xc = (x0 * CANVAS_SIZE) | 0, yc = (y0 * CANVAS_SIZE) | 0;
    let top = Math.max(0, yc - outerRadius),
        bottom = Math.min(CANVAS_SIZE-1, yc + outerRadius);
    for (let y = top; y <= bottom; y++) {
        let s = Math.sqrt(outerRadius * outerRadius - (y - yc) * (y - yc)) | 0;
        let left = Math.max(0, xc - s),
            right = Math.min(CANVAS_SIZE-1, xc + s);
        for (let x = left; x <= right; x++) {
            let p = y * CANVAS_SIZE + x;
            let distance = Math.sqrt((x - xc) * (x - xc) + (y - yc) * (y - yc));
            let strength = 1.0 - Math.min(1, Math.max(0, (distance - innerRadius) / (outerRadius - innerRadius)));
            let factor = rate/1000 * deltaTimeInMs;
            currentStroke.time[p] += strength * factor;
            if (strength > currentStroke.strength[p]) {
                currentStroke.strength[p] = (1 - factor) * currentStroke.strength[p] + factor * strength;
            }
            let mix = currentStroke.strength[p] * Math.min(1, currentStroke.time[p]);
            elevation[p] = (1 - mix) * currentStroke.previousElevation[p] + mix * newElevation;
        }
    }
}

const SIZES = {
    // rate is effect per second
    small:  {key: '1', rate: 8, innerRadius: 2, outerRadius: 6},
    medium: {key: '2', rate: 5, innerRadius: 5, outerRadius: 10},
    large:  {key: '3', rate: 3, innerRadius: 10, outerRadius: 16},
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

/** @type {[string, string, function][]} */
const controls = [
    ['1', "small",    () => { currentSize = 'small'; }],
    ['2', "medium",   () => { currentSize = 'medium'; }],
    ['3', "large",    () => { currentSize = 'large'; }],
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

const slider = /** @type{HTMLInputElement} */(document.getElementById('wind-angle'));
let windAngleDeg = 0;
slider.addEventListener('input', () => {
    exports.setWindAngleDeg(slider.valueAsNumber);
    exports.onUpdate();
});

const output = document.getElementById('mapgen4');
makeDraggable(output, output, (begin, current, state) => {
    let nowMs = Date.now();
    if (state === null) {
        state = 0;
        currentStroke.time.fill(0);
        currentStroke.strength.fill(0);
        currentStroke.previousElevation.set(elevation);
    }
    let coords = [current.x/output.clientWidth,
                  current.y/output.clientHeight];
    coords = exports.screenToWorldCoords(coords);
    paintAt(TOOLS[currentTool], coords[0], coords[1], SIZES[currentSize], nowMs - state);
    exports.onUpdate();
    return nowMs;
});


exports.screenToWorldCoords = coords => coords;
exports.getWindAngleDeg = () => windAngleDeg;
exports.setWindAngleDeg = (angleDeg) => { windAngleDeg = angleDeg; };
exports.onUpdate = () => {};
exports.size = CANVAS_SIZE;
exports.constraints = elevation;

setInitialData();
