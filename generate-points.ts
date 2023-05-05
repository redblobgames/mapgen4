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
import {makeRandFloat} from '@redblobgames/prng';
import {generateInteriorBoundaryPoints, generateExteriorBoundaryPoints} from "./dual-mesh/create.ts";

export type Point = [number, number];
export type PointsData = {
    points: Point[];
    numExteriorBoundaryPoints: number;
    numInteriorBoundaryPoints: number;
    numMountainPoints: number;
}

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
export function choosePoints(seed: number, spacing: number, mountainSpacing: number): PointsData {
    // Generate both interior and exterior boundary points; see
    // https://www.redblobgames.com/x/2314-poisson-with-boundary/
    const boundarySpacing = spacing * Math.sqrt(2);
    const bounds = {left: 0, top: 0, width: 1000, height: 1000}; // left,top must be 0 for poisson
    let interiorBoundaryPoints = generateInteriorBoundaryPoints(bounds, boundarySpacing);
    let exteriorBoundaryPoints = generateExteriorBoundaryPoints(bounds, boundarySpacing);
    
    // Second, generate the mountain points, with the interior boundary points pushing mountains away
    let mountainPointsGenerator = new Poisson({
        shape: [bounds.width, bounds.height],
        radius: mountainSpacing,
        tries: 30,
    }, makeRandFloat(seed));
    for (let p of interiorBoundaryPoints) { if (!mountainPointsGenerator.addPoint(p)) throw "mtn point did not get added"; }
    let interiorPoints: Point[] = mountainPointsGenerator.fill(); // now contains both interior boundary points and mountain points
    let numMountainPoints = interiorPoints.length - interiorBoundaryPoints.length;
    
    // Generate the rest of the mesh points with the interior boundary points and mountain points as constraints
    let generator = new Poisson({
        shape: [bounds.width, bounds.height],
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
