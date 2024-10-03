/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Helper functions for building a TriangleMesh.
 *
 * The TriangleMesh constructor takes points, delaunator output,
 * and a count of the number of boundary points. The boundary points
 * must be the prefix of the points array.
 *
 * To have equally spaced points added around a rectangular boundary,
 * pass in a boundary with the rectangle size and the boundary
 * spacing. If using Poisson disc points, I recommend √2 times the
 * spacing used for Poisson disc.
 *
 * Recommended code structure:

   import {generateInteriorBoundaryPoints} from "dual-mesh/create.js";
   import {TriangleMesh} from "dual-mesh/index.js";

   const bounds = {left: 0, top: 0, width: 1000, height: 1000};
   const spacing = 50;
   let points = generateInteriorBoundaryPoints(bounds, spacing);
   let numBoundaryPoints = points.length;
   let generator = new Poisson({
     shape: [bounds.width, bounds.height],
     minDistance: spacing / Math.sqrt(2),
   });
   for (let p of points) { generator.addPoint(p); }
   points = generator.fill();

   let init = {points, delaunator: Delaunator.from(points), numBoundaryPoints};
   init = TriangleMesh.addGhostStructure(init);
   let mesh = new TriangleMesh(init);

 */
'use strict';
import { TriangleMesh } from "./index.js";
/** Check for skinny triangles, indicating bad point selection */
export function checkTriangleInequality({ points, delaunator: { triangles, halfedges } }) {
    const badAngleLimit = 30;
    let summary = new Array(badAngleLimit).fill(0);
    let count = 0;
    for (let s = 0; s < triangles.length; s++) {
        let r0 = triangles[s], r1 = triangles[TriangleMesh.s_next_s(s)], r2 = triangles[TriangleMesh.s_next_s(TriangleMesh.s_next_s(s))];
        let p0 = points[r0], p1 = points[r1], p2 = points[r2];
        let d0 = [p0[0] - p1[0], p0[1] - p1[1]];
        let d2 = [p2[0] - p1[0], p2[1] - p1[1]];
        let dotProduct = d0[0] * d2[0] + d0[1] + d2[1];
        let angleDegrees = 180 / Math.PI * Math.acos(dotProduct);
        if (angleDegrees < badAngleLimit) {
            summary[angleDegrees | 0]++;
            count++;
        }
    }
    // NOTE: a much faster test would be the ratio of the inradius to
    // the circumradius, but as I'm generating these offline, I'm not
    // worried about speed right now
    // TODO: consider adding circumcenters of skinny triangles to the point set
    if (count > 0) {
        console.log('  bad angles:', summary.join(" "));
    }
}
/**
 * Add vertices evenly along the boundary of the mesh just barely
 * inside the given boundary rectangle.
 *
 * The boundarySpacing parameter should be roughly √2 times the
 * poisson disk minDistance spacing or √½ the maxDistance spacing.
 *
 * They need to be inside and not outside so that these points can be
 * used with the poisson disk libraries I commonly use. The libraries
 * require that all points be inside the range.
 *
 * Since these points are slightly inside the boundary, the triangle
 * mesh will not fill the boundary. Generate exterior boundary points
 * if you need to fill the boundary.
 *
 * I use a *slight* curve so that the Delaunay triangulation doesn't
 * make long thin triangles along the boundary.
 */
export function generateInteriorBoundaryPoints({ left, top, width, height }, boundarySpacing) {
    // https://www.redblobgames.com/x/2314-poisson-with-boundary/
    const epsilon = 1e-4;
    const curvature = 1.0;
    let W = Math.ceil((width - 2 * curvature) / boundarySpacing);
    let H = Math.ceil((height - 2 * curvature) / boundarySpacing);
    let points = [];
    // Top and bottom
    for (let q = 0; q < W; q++) {
        let t = q / W;
        let dx = (width - 2 * curvature) * t;
        let dy = epsilon + curvature * 4 * (t - 0.5) ** 2;
        points.push([left + curvature + dx, top + dy], [left + width - curvature - dx, top + height - dy]);
    }
    // Left and right
    for (let r = 0; r < H; r++) {
        let t = r / H;
        let dy = (height - 2 * curvature) * t;
        let dx = epsilon + curvature * 4 * (t - 0.5) ** 2;
        points.push([left + dx, top + height - curvature - dy], [left + width - dx, top + curvature + dy]);
    }
    return points;
}
/**
 * Add vertices evenly along the boundary of the mesh
 * outside the given boundary rectangle.
 *
 * The boundarySpacing parameter should be roughly √2 times the
 * poisson disk minDistance spacing or √½ the maxDistance spacing.
 *
 * If using poisson disc selection, the interior boundary points will
 * be to keep the points separated and the exterior boundary points
 * will be to make sure the entire map area is filled.
 */
export function generateExteriorBoundaryPoints({ left, top, width, height }, boundarySpacing) {
    // https://www.redblobgames.com/x/2314-poisson-with-boundary/
    const curvature = 1.0;
    const diagonal = boundarySpacing / Math.sqrt(2);
    let points = [];
    let W = Math.ceil((width - 2 * curvature) / boundarySpacing);
    let H = Math.ceil((height - 2 * curvature) / boundarySpacing);
    // Top and bottom
    for (let q = 0; q < W; q++) {
        let t = q / W;
        let dx = (width - 2 * curvature) * t + boundarySpacing / 2;
        points.push([left + dx, top - diagonal], [left + width - dx, top + height + diagonal]);
    }
    // Left and right
    for (let r = 0; r < H; r++) {
        let t = r / H;
        let dy = (height - 2 * curvature) * t + boundarySpacing / 2;
        points.push([left - diagonal, top + height - dy], [left + width + diagonal, top + dy]);
    }
    // Corners
    points.push([left - diagonal, top - diagonal], [left + width + diagonal, top - diagonal], [left - diagonal, top + height + diagonal], [left + width + diagonal, top + height + diagonal]);
    return points;
}
