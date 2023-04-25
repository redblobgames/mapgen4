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
    // Generate both interior and exterior boundary points, using
    // a double layer like I show on
    // https://www.redblobgames.com/x/2314-poisson-with-boundary/
    const epsilon = 1e-4
    const boundarySpacing = param.spacing * Math.sqrt(2);
    const left = 0, top = 0, width = 1000, height = 1000;
    const curvature = 1.0;
    let interiorBoundary = [], exteriorBoundary = [];
    let W = Math.ceil((width - 2 * curvature) / boundarySpacing);
    let H = Math.ceil((height - 2 * curvature) / boundarySpacing);
    for (let q = 0; q < W; q++) {
        let t = q / W;
        let dx = (width - 2 * curvature) * t;
        let dy = epsilon + curvature * 4 * (t - 0.5) ** 2;
        interiorBoundary.push([left + curvature + dx, top + dy], [left + width - curvature - dx, top + height - dy]);
        exteriorBoundary.push([left + dx + boundarySpacing/2, top - boundarySpacing/Math.sqrt(2)],
                              [left + width - dx - boundarySpacing/2, top + height + boundarySpacing/Math.sqrt(2)]);
    }
    for (let r = 0; r < H; r++) {
        let t = r / H;
        let dy = (height - 2 * curvature) * t;
        let dx = epsilon + curvature * 4 * (t - 0.5) ** 2;
        interiorBoundary.push([left + dx, top + height - curvature - dy], [left + width - dx, top + curvature + dy]);
        exteriorBoundary.push([left - boundarySpacing/Math.sqrt(2), top + height - dy - boundarySpacing/2],
                              [left + width + boundarySpacing/Math.sqrt(2), top + dy + boundarySpacing/2]);
    }
    exteriorBoundary.push([left - boundarySpacing/Math.sqrt(2), top - boundarySpacing/Math.sqrt(2)],
                          [left + width + boundarySpacing/Math.sqrt(2), top - boundarySpacing/Math.sqrt(2)],
                          [left - boundarySpacing/Math.sqrt(2), top + height + boundarySpacing/Math.sqrt(2)],
                          [left + width + boundarySpacing/Math.sqrt(2), top + height + boundarySpacing/Math.sqrt(2)]);
    
    // First generate the mountain points, with the interior boundary points pushing mountains away
    let mountainPointsGenerator = new Poisson({
        shape: [width, height],
        radius: param.mountainSpacing,
        tries: 30,
    }, makeRandFloat(param.mesh.seed));
    for (let p of interiorBoundary) { mountainPointsGenerator.addPoint(p); }
    let mountainPoints = mountainPointsGenerator.fill();

    // NOTE: at this point, the mountainPoints include *both* the interior boundary points *and* the actual mountain points
    
    // Generate the rest of the mesh points with the interior boundary points and mountain points as constraints
    let generator = new Poisson({
        shape: [1000, 1000],
        radius: param.spacing,
        tries: 10, // NOTE: below 5 is unstable, and 5 is borderline; defaults to 30, but lower is faster
    }, makeRandFloat(param.mesh.seed));
    for (let p of mountainPoints) { generator.addPoint(p); }
    let points = generator.fill();

    // The mountains are the mountainPoints added after the boundary points
    let peaks_index = []
    for (let index = interiorBoundary.length; index <= mountainPoints.length; index++) {
        peaks_index.push(index);
    }
    
    return {exteriorBoundary, points, peaks_index};
}


export function makeMesh() {
    let {exteriorBoundary, points, peaks_index} = choosePoints();

    let builder = new MeshBuilder()
        .appendPoints(exteriorBoundary.concat(points));
    let mesh = builder.create() as Mesh;
    mesh.numBoundaryRegions = exteriorBoundary.length;
    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    // Mark the triangles that are connected to a boundary region
    // TODO: store 8 bits per byte instead of 1 bit per byte
    mesh.is_boundary_t = new Int8Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        mesh.is_boundary_t[t] = mesh.r_around_t(t).some(r => mesh.is_boundary_r(r)) ? 1 : 0;
    }

    mesh.length_s = new Float32Array(mesh.numSides);
    for (let s = 0; s < mesh.numSides; s++) {
        let r1 = mesh.r_begin_s(s),
            r2 = mesh.r_end_s(s);
        let dx = mesh.x_of_r(r1) - mesh.x_of_r(r2),
            dy = mesh.y_of_r(r1) - mesh.y_of_r(r2);
        mesh.length_s[s] = Math.sqrt(dx*dx + dy*dy);
    }

    /* The input points get assigned to different positions in the
     * output mesh. The peaks_index has indices into the original
     * array. This test makes sure that the logic for mapping input
     * indices to output indices hasn't changed. */
    if (points[200][0] !== mesh.x_of_r(200 + mesh.numBoundaryRegions)
        || points[200][1] !== mesh.y_of_r(200 + mesh.numBoundaryRegions)) {
        throw "Mapping from input points to output points has changed";
    }
    let peaks_r = peaks_index.map(i => i + mesh.numBoundaryRegions);
    
    let t_peaks = [];
    for (let r of peaks_r) {
        t_peaks.push(mesh.t_inner_s(mesh._s_of_r[r]));
    }
    
    return {mesh, t_peaks};
}
