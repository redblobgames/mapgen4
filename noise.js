/*
 * From http://www.redblobgames.com/x/1742-webgl-mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

let SimplexNoise = require('simplex-noise');
const {makeRandFloat} = require('@redblobgames/prng');

const SEED = 12345;
const noiseSize = 1024;
const noiseWavelength = 0.1;

// TODO: this noise needs to wrap around, which means I should use noise4D

function makeNoiseData() {
    console.time('noise-gen');
    let noise = new SimplexNoise(makeRandFloat(SEED));
    let width = noiseSize, height = noiseSize;
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0, p = 0; y < height; y++) {
        let ny = y/noiseSize / noiseWavelength;
        for (let x = 0; x < width; x++) {
            let nx = x/noiseSize / noiseWavelength;
            pixels[p++] = 128 + 80 * noise.noise3D(nx, ny, 1) + 50 * noise.noise3D(nx*2, ny*2, 4);
            pixels[p++] = 128 + 80 * noise.noise3D(nx, ny, 2) + 50 * noise.noise3D(nx*2, ny*2, 5);
            pixels[p++] = 128 + 80 * noise.noise3D(nx, ny, 3) + 50 * noise.noise3D(nx*2, ny*2, 6);
            pixels[p++] = 255;
        }
    }
    console.timeEnd('noise-gen');
    return pixels;
}

exports.width = noiseSize;
exports.height = noiseSize;
exports.data = makeNoiseData();
