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
 * Painting interface uses a <canvas>.
 *
 * As you drag the mouse it will
 * paint filled circles on the canvas.
 *
 * The canvas pixels are then used for determining
 * ocean/valley/mountain in the map generator module.
 *
 * This entire module acts as a global object.
 */

const SimplexNoise = require('simplex-noise');
const Colormap = require('./colormap');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');

const CANVAS_SIZE = 128;

/* The elevation is -128 to -1 → water, 0 to +127 → land */
const elevation = new Int8Array(CANVAS_SIZE * CANVAS_SIZE);
/* The previous elevation is the elevation before the current paint stroke began */
const _previousElevation = new Int8Array(CANVAS_SIZE * CANVAS_SIZE);
/* The painting time is how long, in milliseconds, was spent painting */
const _paintingTime = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);

/* The elevation data is displayed on the screen with a colormap */
const canvas = document.getElementById('paint');
const output = document.getElementById('mapgen4');
canvas.width = canvas.height = CANVAS_SIZE;
const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
const pixels = imageData.data;

/** Set a single pixel in the minimap.
 *
 *  Before calling this function, set the corresponding pixel in the elevation[] array
 */
function setMinimapPixel(x, y) {
    const colormap = Colormap.data;
    let p = y * CANVAS_SIZE + x;
    let q = ((elevation[p] + 128) / 256) * Colormap.width | 0;
    for (let i = 0; i < 4; i++) {
        pixels[4*p + i] = colormap[4 * q + i];
    }
}

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
            let e = 64 * (n(nx + n(nx+5, ny)*warp, ny + n(nx, ny+5)*warp) + 0.2) | 0;
            if (e < -128) { e = -128; }
            if (e > +127) { e = +127; }
            elevation[p] = e;
            if (e > 0) {
                let m = noise.noise2D(x/CANVAS_SIZE + 3, y/CANVAS_SIZE + 5);
                let mountain = 1 - Math.abs(m) / 0.5;
                if (mountain > 0) {
                    elevation[p] = Math.max(e, Math.min(e * 10, mountain * 127 | 0));
                }
            }
            setMinimapPixel(x, y);
        }
    }
}

/** Convert elevation to colors on the canvas */
let _paintQueued = false; // false, or positive integer 
function paintCanvas() {
    if (!_paintQueued) {
        _paintQueued = requestAnimationFrame(() => {
            const colormap = Colormap.data;
            _paintQueued = false;
            ctx.putImageData(imageData, 0, 0);
        });
    }
    exports.onUpdate();
}

/** x0,y0 should be 0-1 */
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
            let strength = 1.0 - Math.min(1, (distance - innerRadius) / outerRadius);
            _paintingTime[p] += strength * (rate/1000 * deltaTimeInMs);
            strength = Math.min(1, _paintingTime[p]);
            elevation[p] = (1 - strength) * _previousElevation[p] + strength * newElevation;
            setMinimapPixel(x, y);
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
    ocean:    {elevation: -30},
    valley:   {elevation: 1},
    mountain: {elevation: 127},
};

let currentTool = 'mountain';
let currentSize = 'small';

function displayCurrentTool() {
    document.getElementById('current-control').textContent = `${currentSize} ${currentTool}`;
}

const controls = [
    ['1', "small", () => { currentSize = 'small'; }],
    ['2', "medium", () => { currentSize = 'medium'; }],
    ['3', "large", () => { currentSize = 'large'; }],
    ['q', "ocean", () => { currentTool = 'ocean'; }],
    ['w', "valley", () => { currentTool = 'valley'; }],
    ['e', "mountain", () => { currentTool = 'mountain'; }],
];

window.addEventListener('keydown', e => {
    for (let control of controls) {
        if (e.key === control[0]) { control[2](); displayCurrentTool(); }
    }
});

for (let control of controls) {
    let container = document.getElementById('buttons');
    let button = document.createElement('button');
    button.textContent = control[0].toUpperCase() + ": " + control[1];
    button.addEventListener('click', () => { control[2](); displayCurrentTool(); } );
    container.appendChild(button);
}
displayCurrentTool();

const slider = document.getElementById('wind-angle');
slider.addEventListener('input', () => {
    exports.windAngleDeg = slider.valueAsNumber;
    exports.onUpdate();
});

for (let element of [canvas, output]) {
    makeDraggable(element, element, (begin, current, state) => {
        let nowMs = Date.now();
        if (state === null) { state = 0; }
        _previousElevation.set(elevation);
        _paintingTime.fill(0);
        paintAt(TOOLS[currentTool], current.x/element.clientWidth, current.y/element.clientHeight, SIZES[currentSize], nowMs - state);
        paintCanvas();
        return nowMs;
    });
}

exports.onUpdate = () => {};
exports.size = CANVAS_SIZE;
exports.constraints = elevation;
exports.windAngleDeg = 0;

setInitialData();
paintCanvas();
