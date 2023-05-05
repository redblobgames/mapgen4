/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module calculates:
 *   * mesh - Delaunay/Voronoi dual mesh
 */

import param from "./config.js";
import Delaunator from 'delaunator';
import {TriangleMesh, MeshInitializer} from "./dual-mesh/index.ts";
// import {choosePoints} from "./generate-points.ts";
import {fromPointsFile} from "./serialize-points.ts";
import type {Mesh} from "./types.d.ts";

export async function makeMesh() {
    let pointsData = await (await fetch(`build/points-${param.spacing}.data`)).arrayBuffer();
    let {points, numExteriorBoundaryPoints, numInteriorBoundaryPoints, numMountainPoints} =
        fromPointsFile(new Uint16Array(pointsData));
        // choosePoints(param.mesh.seed, param.spacing, param.mountainSpacing);

    let meshInit: MeshInitializer = TriangleMesh.addGhostStructure({
        points,
        delaunator: Delaunator.from(points),
        numBoundaryPoints: numExteriorBoundaryPoints,
    });
    let mesh = new TriangleMesh(meshInit) as Mesh;
    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    // Mark the triangles that are connected to a boundary region
    // TODO: store 8 bits per byte instead of 1 bit per byte, or maybe a Set
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

    // NOTE: these are all contigious so it could be shortened to a range
    // (they were not contiguous in earlier versions of mapgen4, so that's
    // why it's an array of indices)
    let r_peaks = Array.from(
        {length: numMountainPoints},
        (_, index) => index + numExteriorBoundaryPoints + numInteriorBoundaryPoints);
                

    // Poisson disc chooses mountain regions but we actually need mountain triangles
    // so we'll just pick one neighboring triangle for each region
    let t_peaks = [];
    for (let r of r_peaks) {
        t_peaks.push(mesh.t_inner_s(mesh._s_of_r[r]));
    }
    
    return {mesh, t_peaks};
}
