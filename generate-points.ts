/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module calculates
 *   * boundary points
 *   * mountain points
 *   * all other points
 */

import Poisson from 'fast-2d-poisson-disk-sampling';
import {makeRandFloat} from "./prng.ts";

type Point = [number, number];

/**
   Generate points which will be seeds for Delaunay Triangulation, and
   will become regions ("r") in the resulting dual mesh.

   The points are returned in a single array with four contiguous blocks:

   [ e e e e e | i i i i i | m m m m m | p p p p p ]
     ^^^^^^^^^   ^^^^^^^^^   ^^^^^^^^^   ^^^^^^^^^
        |           |           |           |______ other interior points
        |           |           |_numMountainPoints mountain peak points
        |           |_____numInteriorBoundaryPoints interior boundary points
        |_________________numExteriorBoundaryPoints exterior boundary points
        

 */
export function choosePoints(seed: number, spacing: number, mountainSpacing: number): {
    points: Point[];
    numExteriorBoundaryPoints: number;
    numInteriorBoundaryPoints: number;
    numMountainPoints: number;
} {
    // First, generate both interior and exterior boundary points, using
    // a double layer like I show on
    // https://www.redblobgames.com/x/2314-poisson-with-boundary/
    const epsilon = 1e-4
    const boundarySpacing = spacing * Math.sqrt(2);
    const left = 0, top = 0, width = 1000, height = 1000;
    const curvature = 1.0;
    let interiorBoundaryPoints = [], exteriorBoundaryPoints = [];
    let W = Math.ceil((width - 2 * curvature) / boundarySpacing);
    let H = Math.ceil((height - 2 * curvature) / boundarySpacing);
    for (let q = 0; q < W; q++) {
        let t = q / W;
        let dx = (width - 2 * curvature) * t;
        let dy = epsilon + curvature * 4 * (t - 0.5) ** 2;
        interiorBoundaryPoints.push([left + curvature + dx, top + dy], [left + width - curvature - dx, top + height - dy]);
        exteriorBoundaryPoints.push([left + dx + boundarySpacing/2, top - boundarySpacing/Math.sqrt(2)],
                                    [left + width - dx - boundarySpacing/2, top + height + boundarySpacing/Math.sqrt(2)]);
    }
    for (let r = 0; r < H; r++) {
        let t = r / H;
        let dy = (height - 2 * curvature) * t;
        let dx = epsilon + curvature * 4 * (t - 0.5) ** 2;
        interiorBoundaryPoints.push([left + dx, top + height - curvature - dy], [left + width - dx, top + curvature + dy]);
        exteriorBoundaryPoints.push([left - boundarySpacing/Math.sqrt(2), top + height - dy - boundarySpacing/2],
                                    [left + width + boundarySpacing/Math.sqrt(2), top + dy + boundarySpacing/2]);
    }
    exteriorBoundaryPoints.push([left - boundarySpacing/Math.sqrt(2), top - boundarySpacing/Math.sqrt(2)],
                                [left + width + boundarySpacing/Math.sqrt(2), top - boundarySpacing/Math.sqrt(2)],
                                [left - boundarySpacing/Math.sqrt(2), top + height + boundarySpacing/Math.sqrt(2)],
                                [left + width + boundarySpacing/Math.sqrt(2), top + height + boundarySpacing/Math.sqrt(2)]);
    
    // Second, generate the mountain points, with the interior boundary points pushing mountains away
    let mountainPointsGenerator = new Poisson({
        shape: [width, height],
        radius: mountainSpacing,
        tries: 30,
    }, makeRandFloat(seed));
    for (let p of interiorBoundaryPoints) { if (!mountainPointsGenerator.addPoint(p)) throw "mtn point did not get added"; }
    let interiorPoints: Point[] = mountainPointsGenerator.fill(); // now contains both interior boundary points and mountain points
    let numMountainPoints = interiorPoints.length - interiorBoundaryPoints.length;
    
    // Generate the rest of the mesh points with the interior boundary points and mountain points as constraints
    let generator = new Poisson({
        shape: [1000, 1000],
        radius: spacing,
        tries: 6, // NOTE: below 5 is unstable, and 5 is borderline; defaults to 30, but lower is faster
    }, makeRandFloat(seed));
    for (let p of interiorPoints) { if (!generator.addPoint(p)) throw "point did not get added"; }
    interiorPoints = generator.fill(); // now contains interior boundary points, mountain points, and rest of points
    
    return {
        points: exteriorBoundaryPoints.concat(interiorPoints),
        numExteriorBoundaryPoints: exteriorBoundaryPoints.length,
        numInteriorBoundaryPoints: interiorBoundaryPoints.length,
        numMountainPoints
    };
}
