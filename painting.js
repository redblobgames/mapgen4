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
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');

const size = 128;

/* The constraint data is stored here */
const constraints = new Uint8Array(size*size);
constraints.OCEAN = exports.OCEAN = 0;
constraints.VALLEY = exports.VALLEY = 1;
constraints.MOUNTAIN = exports.MOUNTAIN = 2;

/* The constraint data is displayed on the screen with colors */
const canvas = document.getElementById('paint');
const output = document.getElementById('mapgen4');
canvas.width = canvas.height = size;
const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, size, size);
const pixels = imageData.data;
const colors = {
    [constraints.OCEAN]: [0, 0, 255, 255],
    [constraints.VALLEY]: [0, 255, 0, 255],
    [constraints.MOUNTAIN]: [255, 0, 0, 255],
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
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let p = y * size + x;
            let nx = 2 * (x/size - 0.5),
                ny = 2 * (y/size - 0.5);
            let e = n(nx + n(nx+5, ny)*warp, ny + n(nx, ny+5)*warp);
            let m = noise.noise2D(x/size + 3, y/size + 5);
            if (e < -0.2) {
                constraints[p] = constraints.OCEAN;
            } else if (Math.abs(m) < 0.02) {
                constraints[p] = constraints.MOUNTAIN;
            } else {
                constraints[p] = constraints.VALLEY;
            }
        }
    }
}

/** Convert constraints to colors on the canvas */
function paintCanvas() {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let p = y * size + x;
            let color = colors[constraints[p]];
            for (let i = 0; i < 4; i++) {
                pixels[4*p + i] = color[i];
            }
        }
    }
    ctx.putImageData(imageData, 0, 0);
    exports.onUpdate();
}

/** x,y should be 0-1 */
function paintAt(tool, x0, y0, r) {
    let xc = (x0 * size) | 0, yc = (y0 * size) | 0;
    let top = Math.max(0, yc - r),
        bottom = Math.min(size-1, yc + r);
    for (let y = top; y <= bottom; y++) {
        let s = Math.sqrt(r * r - (y - yc) * (y - yc)) | 0;
        let left = Math.max(0, xc - s),
            right = Math.min(size-1, xc + s);
        for (let x = left; x <= right; x++) {
            let p = y * size + x;
            constraints[p] = tool;
        }
    }
}

let currentTool = constraints.MOUNTAIN;
let currentSize = 2;

function displayCurrentTool() {
    document.getElementById('current-control').textContent = (
        (currentSize === 2? "small": currentSize === 4? "medium" : "large")
            + " "
            + (currentTool === constraints.OCEAN? "ocean" : currentTool === constraints.VALLEY? "valley" : "mountain")
    );
}

const controls = [
    ['1', "small", () => { currentSize = 2; }],
    ['2', "medium", () => { currentSize = 4; }],
    ['3', "large", () => { currentSize = 10; }],
    ['q', "ocean", () => { currentTool = constraints.OCEAN; }],
    ['w', "valley", () => { currentTool = constraints.VALLEY; }],
    ['e', "mountain", () => { currentTool = constraints.MOUNTAIN; }],
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

makeDraggable(canvas, canvas, (begin, current, state) => {
    paintAt(currentTool, current.x/canvas.clientWidth, current.y/canvas.clientHeight, currentSize);
    paintCanvas();
});
makeDraggable(output, output, (begin, current, state) => {
    paintAt(currentTool, current.x/output.clientWidth, current.y/output.clientHeight, currentSize);
    paintCanvas();
});

exports.onUpdate = () => {};

/** Given x,y from 0.0 to 1.0, return the constraint closest to that point */
exports.size = size;
exports.constraints = constraints;
exports.constraintAt = function(x, y) {
    y = (size * y) | 0;
    x = (size * x) | 0;
    if (0 <= x && x < size && 0 <= y && y < size) {
        let p = size * y + x;
        return constraints[p];
    } else {
        return constraints.OCEAN;
    }
};

setInitialData();
paintCanvas();

// TODO: drag an image onto this
