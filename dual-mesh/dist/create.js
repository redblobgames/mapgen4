/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Generate a random triangle mesh for a rectangular area, optionally
 * with boundary points, optionally with ghost elements.
 *
 */
'use strict';
import Delaunator from 'delaunator';
import { TriangleMesh } from "./index.js";
function checkPointInequality(_init) {
    // TODO: check for collinear vertices. Around each red point P if
    // there's a point Q and R both connected to it, and the angle P→Q and
    // the angle P→R are 180° apart, then there's collinearity. This would
    // indicate an issue with point selection.
}
function checkTriangleInequality({ points, delaunator: { triangles, halfedges } }) {
    // check for skinny triangles
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
function checkMeshConnectivity({ points, delaunator: { triangles, halfedges } }) {
    // 1. make sure each side's opposite is back to itself
    // 2. make sure region-circulating starting from each side works
    let r_ghost = points.length - 1, s_out = [];
    for (let s0 = 0; s0 < triangles.length; s0++) {
        if (halfedges[halfedges[s0]] !== s0) {
            console.log(`FAIL _halfedges[_halfedges[${s0}]] !== ${s0}`);
        }
        let s = s0, count = 0;
        s_out.length = 0;
        do {
            count++;
            s_out.push(s);
            s = TriangleMesh.s_next_s(halfedges[s]);
            if (count > 100 && triangles[s0] !== r_ghost) {
                console.log(`FAIL to circulate around region with start side=${s0} from region ${triangles[s0]} to ${triangles[TriangleMesh.s_next_s(s0)]}, out_s=${s_out}`);
                break;
            }
        } while (s !== s0);
    }
}
/*
 * Add vertices evenly along the boundary of the mesh
 * just barely inside the given boundary rectangle.
 *
 * The boundarySpacing parameter should be roughly √2
 * times the poisson disk minDistance spacing or √½ the
 * maxDistance spacing.
 *
 * They need to be inside and not outside so that these
 * points can be used with the poisson disk libraries I
 * commonly use. The libraries require that all points
 * be inside the range.
 *
 * I use a *slight* curve so that the Delaunay triangulation
 * doesn't make long thin triangles along the boundary.
 */
function addBoundaryPoints({ left, top, width, height }, boundarySpacing) {
    const curvature = 1.0;
    let W = Math.ceil((width - 2 * curvature) / boundarySpacing);
    let H = Math.ceil((height - 2 * curvature) / boundarySpacing);
    let points = [];
    for (let q = 0; q < W; q++) {
        let t = q / W;
        let dx = (width - 2 * curvature) * t;
        let dy = curvature * 4 * (t - 0.5) ** 2;
        points.push([left + curvature + dx, top + dy], [left + width - curvature - dx, top + height - dy]);
    }
    for (let r = 0; r < H; r++) {
        let t = r / H;
        let dy = (height - 2 * curvature) * t;
        let dx = curvature * 4 * (t - 0.5) ** 2;
        points.push([left + dx, top + height - curvature - dy], [left + width - dx, top + curvature + dy]);
    }
    return points;
}
/**
 * Build a dual mesh from points, with ghost triangles around the exterior.
 *
 * Options:
 *   - To have equally spaced points added around a rectangular boundary,
 *     pass in a boundary with the rectangle size and the boundary spacing.
 *     If using Poisson disc points, I recommend √2 times the spacing used
 *     for Poisson disc.
 *
 * Phases:
 *   - Add boundary points
 *   - Add your own set of points
 *   - Add Poisson disc points
 *
 * The mesh generator runs some sanity checks but does not correct the
 * generated points.
 *
 * Examples:
 *
 * Build a mesh with poisson disc points and a boundary:
 *
 * TODO:
 * new MeshBuilder(options)
 *    .appendPoints(pointsArray)
 *    .create()
 */
export default class MeshBuilder {
    points;
    numBoundaryRegions;
    options;
    constructor(options = {}) {
        let boundaryPoints = options.boundarySpacing ? addBoundaryPoints(options.bounds, options.boundarySpacing) : [];
        this.points = boundaryPoints;
        this.numBoundaryRegions = boundaryPoints.length;
        this.options = options;
    }
    /** pass in a function to return a new points array; note that
     * if there are existing boundary points, they should be preserved */
    replacePointsFn(adder) {
        this.points = adder(this.points);
        return this;
    }
    /** pass in an array of new points to append to the points array */
    appendPoint(newPoints) {
        this.points = this.points.concat(newPoints);
        return this;
    }
    /** Points will be [x, y] */
    getNonBoundaryPoints() {
        return this.points.slice(this.numBoundaryRegions);
    }
    /** (used for more advanced mixing of different mesh types) */
    clearNonBoundaryPoints() {
        this.points.splice(this.numBoundaryRegions, this.points.length);
        return this;
    }
    /** Build and return a TriangleMesh */
    create(runChecks = false) {
        let init = {
            points: this.points,
            delaunator: Delaunator.from(this.points),
        };
        // TODO: check that all bounding points are inside the bounding rectangle
        // TODO: check that the boundary points at the corners connect in a way that stays outside
        // the bounding rectangle, so that the convex hull is entirely outside the rectangle
        if (runChecks) {
            checkPointInequality(init);
            checkTriangleInequality(init);
        }
        let withGhost = TriangleMesh.addGhostStructure(init);
        withGhost.numBoundaryRegions = this.numBoundaryRegions;
        if (runChecks) {
            checkMeshConnectivity(withGhost);
        }
        let mesh = new TriangleMesh(withGhost);
        mesh._options = this.options;
        return mesh;
    }
}
