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
import TriangleMesh from "./index.js";
function s_next_s(s) { return (s % 3 == 2) ? s - 2 : s + 1; }
function checkPointInequality({ _vertex_r, _triangles, _halfedges }) {
    // TODO: check for collinear vertices. Around each red point P if
    // there's a point Q and R both connected to it, and the angle P→Q and
    // the angle P→R are 180° apart, then there's collinearity. This would
    // indicate an issue with point selection.
}
function checkTriangleInequality({ _vertex_r, _triangles, _halfedges }) {
    // check for skinny triangles
    const badAngleLimit = 30;
    let summary = new Array(badAngleLimit).fill(0);
    let count = 0;
    for (let s = 0; s < _triangles.length; s++) {
        let r0 = _triangles[s], r1 = _triangles[s_next_s(s)], r2 = _triangles[s_next_s(s_next_s(s))];
        let p0 = _vertex_r[r0], p1 = _vertex_r[r1], p2 = _vertex_r[r2];
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
function checkMeshConnectivity({ _vertex_r, _triangles, _halfedges }) {
    // 1. make sure each side's opposite is back to itself
    // 2. make sure region-circulating starting from each side works
    let r_ghost = _vertex_r.length - 1, s_out = [];
    for (let s0 = 0; s0 < _triangles.length; s0++) {
        if (_halfedges[_halfedges[s0]] !== s0) {
            console.log(`FAIL _halfedges[_halfedges[${s0}]] !== ${s0}`);
        }
        let s = s0, count = 0;
        s_out.length = 0;
        do {
            count++;
            s_out.push(s);
            s = s_next_s(_halfedges[s]);
            if (count > 100 && _triangles[s0] !== r_ghost) {
                console.log(`FAIL to circulate around region with start side=${s0} from region ${_triangles[s0]} to ${_triangles[s_next_s(s0)]}, out_s=${s_out}`);
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
function addGhostStructure({ _vertex_r, _triangles, _halfedges }) {
    const numSolidSides = _triangles.length;
    let numUnpairedSides = 0, firstUnpairedEdge = -1;
    let s_unpaired_r = []; // seed to side
    for (let s = 0; s < numSolidSides; s++) {
        if (_halfedges[s] === -1) {
            numUnpairedSides++;
            s_unpaired_r[_triangles[s]] = s;
            firstUnpairedEdge = s;
        }
    }
    const r_ghost = _vertex_r.length;
    let newvertex_r = _vertex_r.concat([[NaN, NaN]]);
    let r_newstart_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    r_newstart_s.set(_triangles);
    let s_newopposite_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    s_newopposite_s.set(_halfedges);
    for (let i = 0, s = firstUnpairedEdge; i < numUnpairedSides; i++, s = s_unpaired_r[r_newstart_s[s_next_s(s)]]) {
        // Construct a ghost side for s
        let s_ghost = numSolidSides + 3 * i;
        s_newopposite_s[s] = s_ghost;
        s_newopposite_s[s_ghost] = s;
        r_newstart_s[s_ghost] = r_newstart_s[s_next_s(s)];
        // Construct the rest of the ghost triangle
        r_newstart_s[s_ghost + 1] = r_newstart_s[s];
        r_newstart_s[s_ghost + 2] = r_ghost;
        let k = numSolidSides + (3 * i + 4) % (3 * numUnpairedSides);
        s_newopposite_s[s_ghost + 2] = k;
        s_newopposite_s[k] = s_ghost + 2;
    }
    return {
        numSolidSides,
        numBoundaryRegions: 0,
        _vertex_r: newvertex_r,
        _triangles: r_newstart_s,
        _halfedges: s_newopposite_s
    };
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
    appendPoints(newPoints) {
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
        let delaunator = Delaunator.from(this.points);
        let graph = {
            numBoundaryRegions: 0,
            numSolidSides: 0,
            _vertex_r: this.points,
            _triangles: delaunator.triangles,
            _halfedges: delaunator.halfedges
        };
        // TODO: check that all bounding points are inside the bounding rectangle
        // TODO: check that the boundary points at the corners connect in a way that stays outside
        // the bounding rectangle, so that the convex hull is entirely outside the rectangle
        if (runChecks) {
            checkPointInequality(graph);
            checkTriangleInequality(graph);
        }
        graph = addGhostStructure(graph);
        graph.numBoundaryRegions = this.numBoundaryRegions;
        if (runChecks) {
            checkMeshConnectivity(graph);
        }
        let mesh = new TriangleMesh(graph);
        mesh._options = this.options;
        return mesh;
    }
}
