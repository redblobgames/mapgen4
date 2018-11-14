/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Generate the points used for the mountains peaks and the mesh.
 *
 * This step is slow and it doesn't vary from one run to the next so
 * it makes sense to precompute the results and save them to a file.
 *
 * File format: Int16Array, where first element is the number of
 * mountain peaks M, then the next M elements are the mountainIndices into the
 * mesh that have mountain peaks, then the rest are X,Y
 */
'use strict';

const fs = require('fs');
const {makeRandFloat} = require('@redblobgames/prng');
const Poisson = require('poisson-disk-sampling');
const {mesh, spacing, mountainSpacing} = require('./config');

const filename = `build/points-${spacing}.data`;

/* First generate the mountain points */
let mountainPoints = new Poisson([1000, 1000], mountainSpacing, undefined, undefined, makeRandFloat(mesh.seed)).fill();

/* Generate the rest of the mesh points with the mountain points as constraints */
let generator = new Poisson([1000, 1000], spacing, undefined, undefined, makeRandFloat(mesh.seed));
for (let p of mountainPoints) { generator.addPoint(p); }
let meshPoints = generator.fill();

/* For better compression, I want to sort the points. However, that
 * means the mountain points are no longer at the beginning of the
 * array, so I need some way to find them. Solution: keep track of the
 * original position of the points, then write out the new positions
 * of the mountain points. */
meshPoints = meshPoints.map((p, i) => [p[0] | 0, p[1] | 0, i]);
meshPoints.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

/* File format described at top */
let mountainIndices = [];
for (let i = 0; i < meshPoints.length; i++) {
    if (meshPoints[i][2] < mountainPoints.length) {
        mountainIndices.push(i);
    }
}
let flat = [mountainPoints.length].concat(mountainIndices);
for (let p of meshPoints) {
    flat.push(p[0], p[1]);
}


fs.writeFileSync(filename, Uint16Array.from(flat));

/* For debugging, write an ascii version: */
// fs.writeFileSync(filename, JSON.stringify(flat));
