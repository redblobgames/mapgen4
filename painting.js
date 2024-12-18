/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module allows the user to paint constraints for the map generator
 */
'use strict';

/* global Draggable */

/*
 * The painting interface uses a square array of elevations. As you
 * drag the mouse it will paint filled circles into the elevation map,
 * then send the elevation map to the generator to produce the output.
 */

import SimplexNoise from 'simplex-noise';
import {makeRandFloat} from '@redblobgames/prng';

const CANVAS_SIZE = 128;
const FRAMES_PER_SECOND = 24; // for 2218-mapgen4-animated

const currentStroke = {
    /* elevation before the current paint stroke began */
    previousElevation: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
    /* how long, in milliseconds, was spent painting */
    time: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
    /* maximum strength applied */
    strength: new Float32Array(CANVAS_SIZE * CANVAS_SIZE),
};


/* The elevation is -1.0 to 0.0 → water, 0.0 to +1.0 → land */
class Generator {
    constructor () {
        this.userHasPainted = false;
        this.elevation = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);
        this.animation = {
            time: 0,
            meander: {
                x: 0,
                y: 0,
                d_angle: 0,
                angle: Math.PI,
            },
            zoom: {
                z: 1,
                angle: 0,
            },
        };
    }

    setElevationParam(elevationParam) {
        if (   elevationParam.seed   !== this.seed
            || elevationParam.island !== this.island) {
            this.seed   = elevationParam.seed;
            this.island = elevationParam.island;
            this.generate();
        }
    }

    // The current animation depends on which mode we're in
    updateAnimationState() {
        const animationStyle = document.querySelector("input[name='animate'][type='radio']:checked").value;
        switch (animationStyle) {
            case 'time':
                this.animation.time += 2e-3;
                break;
            case 'meander':
                const step = 0.002;
                this.animation.meander.d_angle =
                    (this.animation.meander.d_angle * 0.995 + 3 * (Math.random() - Math.random()));
                this.animation.meander.angle += 0.0005 * this.animation.meander.d_angle;
                this.animation.meander.x += step * Math.cos(this.animation.meander.angle);
                this.animation.meander.y += step * Math.sin(this.animation.meander.angle);
                break;
            case 'zoom':
                this.animation.zoom.z += 0.005;
                this.animation.zoom.angle += 0.003;
                break;
        }
    }

    /** Use a noise function to determine the shape */
    generate() {
        this.updateAnimationState();
        const {elevation, island} = this;
        const noise = new SimplexNoise(makeRandFloat(this.seed));
        const persistence = 1/2;
        const amplitudes = [0, ...Array.from({length: 5}, (_, octave) => Math.pow(persistence, octave)), 0];

        const noise2D = (x, y, base_x=0, base_y=0) => {
            const {time, meander, zoom} = this.animation;
            [x, y] = [Math.cos(zoom.angle) * x + Math.sin(zoom.angle) * y,
                      -Math.sin(zoom.angle) * x + Math.cos(zoom.angle) * y];
            return noise.noise3D(
                meander.x + x + base_x,
                meander.y + y + base_y,
                time
            );
        };

        function lerp(a, b, t) { return a * (1-t) + b * t; }
        const fbm_noise = (nx, ny) => {
            let sum = 0, sumOfAmplitudes = 0;
            // To implement zoom I want to have a sliding window of octaves,
            // similar to Shepard Tone I think
            let phase = this.animation.zoom.z % 1.0;
            for (let octave = 0; octave < amplitudes.length-1; octave++) {
                // TODO: there's a discontinuity in velocity here, and this lerp timing isn't right
                let amplitude = lerp(amplitudes[octave+1], amplitudes[octave], (2**phase)-1);
                let frequency = (1 << octave) / (1.0 + phase);
                sum += amplitude * noise2D(nx * frequency, ny * frequency);
                sumOfAmplitudes += amplitude;
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
                    let m = (0.5 * noise2D(nx, ny, 30, 50)
                             + 0.5 * noise2D(2*nx, 2*ny, 33, 55));
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

    /**
     * Paint a circular region
     *
     * @param {{elevation: number}} tool
     * @param {number} x0 - should be 0 to 1
     * @param {number} y0 - should be 0 to 1
     * @param {{innerRadius: number, outerRadius: number, rate: number}} size
     * @param {number} deltaTimeInMs
     */
    paintAt(tool, x0, y0, size, deltaTimeInMs) {
        let {elevation} = this;
        /* This has two effects: first time you click the mouse it has a
         * strong effect, and it also limits the amount in case you
         * pause */
        deltaTimeInMs = Math.min(100, deltaTimeInMs);

        let newElevation = tool.elevation;
        let {innerRadius, outerRadius, rate} = size;
        let xc = (x0 * CANVAS_SIZE) | 0, yc = (y0 * CANVAS_SIZE) | 0;
        let top = Math.ceil(Math.max(0, yc - outerRadius)),
            bottom = Math.floor(Math.min(CANVAS_SIZE-1, yc + outerRadius));
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

        this.userHasPainted = true;
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

/** @type {[string, string, function][]} */
const controls = [
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


setInterval(() => {
    heightMap.generate();
    exported.onUpdate();
}, 1000/FRAMES_PER_SECOND);
    
export default exported;
