/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module calculates:
 *   * points - seeds for regions (r) spaced with blue noise
 *   * mountain peaks - triangles (t) also spaced with blue noise
 *   * mesh - Delaunay/Voronoi dual mesh
 */

import param from "./config.js";
import MeshBuilder from "./dual-mesh/create.ts";
import Poisson from 'fast-2d-poisson-disk-sampling';
import {makeRandFloat} from "./prng.ts";
import type {Mesh} from "./types.d.ts";


/**
   Generate points, and mountain points as a subset of them.

   Note that the points can take a while to generate, so this is a
   candidate for precomputing and saving to a file, like mapgen4 did.
 */
function choosePoints() {
    /* First generate the mountain points */
    let mountainPoints = new Poisson({
        shape: [1000, 1000],
        radius: param.mountainSpacing,
        tries: 30,
    }, makeRandFloat(param.mesh.seed)).fill();

    /* Generate the rest of the mesh points with the mountain points as constraints */
    let generator = new Poisson({
        shape: [1000, 1000],
        radius: param.spacing,
        tries: 6, // NOTE: below 5 is unstable, and 5 is borderline
    }, makeRandFloat(param.mesh.seed));
    for (let p of mountainPoints) { generator.addPoint(p); }
    let points = generator.fill();
    let peaks_index = mountainPoints.map((_, index) => index);
    
    return {points, peaks_index};
}


export function makeMesh() {
    let {points, peaks_index} = choosePoints();

    let builder = new MeshBuilder({boundarySpacing: param.spacing * 1.5})
        .addPoints(points);
    let mesh = builder.create() as Mesh;
    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    mesh.s_length = new Float32Array(mesh.numSides);
    for (let s = 0; s < mesh.numSides; s++) {
        let r1 = mesh.s_begin_r(s),
            r2 = mesh.s_end_r(s);
        let dx = mesh.r_x(r1) - mesh.r_x(r2),
            dy = mesh.r_y(r1) - mesh.r_y(r2);
        mesh.s_length[s] = Math.sqrt(dx*dx + dy*dy);
    }

    /* The input points get assigned to different positions in the
     * output mesh. The peaks_index has indices into the original
     * array. This test makes sure that the logic for mapping input
     * indices to output indices hasn't changed. */
    if (points[200][0] !== mesh.r_x(200 + mesh.numBoundaryRegions)
        || points[200][1] !== mesh.r_y(200 + mesh.numBoundaryRegions)) {
        throw "Mapping from input points to output points has changed";
    }
    let peaks_r = peaks_index.map(i => i + mesh.numBoundaryRegions);
    
    let peaks_t = [];
    for (let r of peaks_r) {
        peaks_t.push(mesh.s_inner_t(mesh._r_in_s[r]));
    }
    
    return {mesh, peaks_t};
}
