/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Generate a random triangle mesh for the area 0 <= x <= 1000, 0 <= y <= 1000
 *
 */

'use strict';

import Delaunator from 'delaunator';
import TriangleMesh from "./index.js";

function s_next_s(s: number): number { return (s % 3 == 2) ? s-2 : s+1; }


function checkPointInequality({_vertex_r, _triangles, _halfedges}) {
    // TODO: check for collinear vertices. Around each red point P if
    // there's a point Q and R both connected to it, and the angle P→Q and
    // the angle P→R are 180° apart, then there's collinearity. This would
    // indicate an issue with point selection.
}


function checkTriangleInequality({_vertex_r, _triangles, _halfedges}) {
    // check for skinny triangles
    const badAngleLimit = 30;
    let summary = new Array(badAngleLimit).fill(0);
    let count = 0;
    for (let s = 0; s < _triangles.length; s++) {
        let r0 = _triangles[s],
            r1 = _triangles[s_next_s(s)],
            r2 = _triangles[s_next_s(s_next_s(s))];
        let p0 = _vertex_r[r0],
            p1 = _vertex_r[r1],
            p2 = _vertex_r[r2];
        let d0 = [p0[0]-p1[0], p0[1]-p1[1]];
        let d2 = [p2[0]-p1[0], p2[1]-p1[1]];
        let dotProduct = d0[0] * d2[0] + d0[1] + d2[1];
        let angleDegrees = 180 / Math.PI * Math.acos(dotProduct);
        if (angleDegrees < badAngleLimit) {
            summary[angleDegrees|0]++;
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


function checkMeshConnectivity({_vertex_r, _triangles, _halfedges}) {
    // 1. make sure each side's opposite is back to itself
    // 2. make sure region-circulating starting from each side works
    let r_ghost = _vertex_r.length - 1, out_s = [];
    for (let s0 = 0; s0 < _triangles.length; s0++) {
        if (_halfedges[_halfedges[s0]] !== s0) {
            console.log(`FAIL _halfedges[_halfedges[${s0}]] !== ${s0}`);
        }
        let s = s0, count = 0;
        out_s.length = 0;
        do {
            count++; out_s.push(s);
            s = s_next_s(_halfedges[s]);
            if (count > 100 && _triangles[s0] !== r_ghost) {
                console.log(`FAIL to circulate around region with start side=${s0} from region ${_triangles[s0]} to ${_triangles[s_next_s(s0)]}, out_s=${out_s}`);
                break;
            }
        } while (s !== s0);
    }
}


/*
 * Add vertices evenly along the boundary of the mesh;
 * use a slight curve so that the Delaunay triangulation
 * doesn't make long thing triangles along the boundary.
 * These points also prevent the Poisson disc generator
 * from making uneven points near the boundary.
 */
function addBoundaryPoints(spacing: number, size: number): Array<[number, number]> {
    let N = Math.ceil(size/spacing);
    let points = [];
    for (let i = 0; i <= N; i++) {
        let t = (i + 0.5) / (N + 1);
        let w = size * t;
        let offset = Math.pow(t - 0.5, 2);
        points.push([offset, w], [size-offset, w]);
        points.push([w, offset], [w, size-offset]);
    }
    return points;
}


function addGhostStructure({_vertex_r, _triangles, _halfedges}) {
    const numSolidSides = _triangles.length;
    const r_ghost = _vertex_r.length;
    
    let numUnpairedSides = 0, firstUnpairedEdge = -1;
    let s_unpaired_r = []; // seed to side
    for (let s = 0; s < numSolidSides; s++) {
        if (_halfedges[s] === -1) {
            numUnpairedSides++;
            s_unpaired_r[_triangles[s]] = s;
            firstUnpairedEdge = s;
        }
    }

    let newvertex_r = _vertex_r.concat([[500, 500]]);
    let r_newstart_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    r_newstart_s.set(_triangles);
    let s_newopposite_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    s_newopposite_s.set(_halfedges);

    for (let i = 0, s = firstUnpairedEdge;
         i < numUnpairedSides;
         i++, s = s_unpaired_r[r_newstart_s[s_next_s(s)]]) {

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
 * The builder assumes 0 ≤ x < 1000, 0 ≤ y < 1000
 *
 * Options:
 *   - To have equally spaced points added around the 1000x1000 boundary,
 *     pass in boundarySpacing > 0 with the spacing value. If using Poisson
 *     disc points, I recommend 1.5 times the spacing used for Poisson disc.
 *
 * Phases:
 *   - Your own set of points
 *   - Poisson disc points
 *
 * The mesh generator runs some sanity checks but does not correct the
 * generated points.
 *
 * Examples:
 *
 * Build a mesh with poisson disc points and a boundary:
 *
 * new MeshBuilder({boundarySpacing: 150})
 *    .addPoisson(Poisson, 100)
 *    .create()
 */
export default class MeshBuilder {
    points: Array<[number, number]>;
    numBoundaryRegions: number;
    
    /** If boundarySpacing > 0 there will be a boundary added around the 1000x1000 area */
    constructor ({boundarySpacing=0} = {}) {
        let boundaryPoints = boundarySpacing > 0 ? addBoundaryPoints(boundarySpacing, 1000) : [];
        this.points = boundaryPoints;
        this.numBoundaryRegions = boundaryPoints.length;
    }

    /** Points should be [x, y] */
    addPoints(newPoints: Array<[number, number]>): this {
        for (let p of newPoints) {
            this.points.push(p);
        }
        return this;
    }

    /** Points will be [x, y] */
    getNonBoundaryPoints(): Array<[number, number]> {
        return this.points.slice(this.numBoundaryRegions);
    }
    
    /** (used for more advanced mixing of different mesh types) */
    clearNonBoundaryPoints(): this {
        this.points.splice(this.numBoundaryRegions, this.points.length);
        return this;
    }
    
    /** Pass in the constructor from the poisson-disk-sampling module */
    addPoisson(Poisson: any, spacing: number, random: ()=>number = Math.random) {
        let generator = new Poisson({
            shape: [1000, 1000],
            minDistance: spacing,
        }, random);
        this.points.forEach(p => generator.addPoint(p));
        this.points = generator.fill();
        return this;
    }

    /** Build and return a TriangleMesh */
    create(runChecks:boolean=false) {
        let delaunator = Delaunator.from(this.points);
        let graph = {
            numBoundaryRegions: 0,
            numSolidSides: 0,
            _vertex_r: this.points,
            _triangles: delaunator.triangles,
            _halfedges: delaunator.halfedges
        };

        if (runChecks) {
            checkPointInequality(graph);
            checkTriangleInequality(graph);
        }
        
        graph = addGhostStructure(graph);
        graph.numBoundaryRegions = this.numBoundaryRegions;
        if (runChecks) {
            checkMeshConnectivity(graph);
        }

        return new TriangleMesh(graph);
    }
}
