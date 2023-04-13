/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

'use strict';

import Delaunator from 'delaunator';
import Poisson from 'poisson-disk-sampling';
import MeshBuilder from "./dist/create.js";

const Test = {
    count: 0,
    equal(a, b) {
        const msg = `${a} === ${b}`;
        if (a === b) this.pass(msg);
        else this.fail(msg);
    },
    pass(msg) {
        console.log("OK  ", this.count++, msg);
    },
    fail(msg) {
        console.error("FAIL", this.count++, msg);
    },
};


function testStructuralInvariants() {
    let mesh = new MeshBuilder({
        bounds: {left: 0, top: 0, width: 1000, height: 1000},
        boundarySpacing: 450})
        .replacePointsFn((points) => {
            let generator = new Poisson({
                shape: [1000, 1000],
                minDistance: 450,
            });
            for (let p of points) generator.addPoint(p);
            return generator.fill();
        })
        .create(true);
    
    let s_out = [];
    for (let s1 = 0; s1 < mesh.numSides; s1++) {
        let s2 = mesh.s_opposite_s(s1);
        Test.equal(mesh.s_opposite_s(s2), s1);
        Test.equal(mesh.r_begin_s(s1), mesh.r_end_s(s2));
        Test.equal(mesh.t_inner_s(s1), mesh.t_outer_s(s2));
        Test.equal(mesh.r_begin_s(mesh.s_next_s(s1)), mesh.r_begin_s(s2));
    }
    for (let r = 0; r < mesh.numRegions; r++) {
        mesh.s_around_r(r, s_out);
        for (let s of s_out) {
            Test.equal(mesh.r_begin_s(s), r);
        }
    }
    for (let t = 0; t < mesh.numTriangles; t++) {
        mesh.s_around_t(t, s_out);
        for (let s of s_out) {
            Test.equal(mesh.t_inner_s(s), t);
        }
    }
}


function testHalfEdges1() {
    let points = [[122,270],[181,121],[195,852],[204,694],[273,525],[280,355],[31,946],[319,938],[33,625],[344,93],[369,793],[38,18],[426,539],[454,239],[503,51],[506,997],[516,661],[532,386],[619,889],[689,131],[730,511],[747,750],[760,285],[856,83],[88,479],[884,943],[927,696],[960,472],[992,253]];
    points = points.map((p) => [p[0] + Math.random(), p[1]]);
    var d = Delaunator.from(points);
    for (var i = 0; i < d.halfedges.length; i++) {
        var i2 = d.halfedges[i];
        if (i2 !== -1 && d.halfedges[i2] !== i) {
            Test.fail('invalid halfedge connection');
            return;
        }
    }
    Test.pass('halfedges are valid');
}

function testHalfEdges2() {
    // NOTE: this is not a great test because the input data is
    // different each time; need to switch to a deterministic random
    // number generator
    let generator = new Poisson({shape: [1000, 1000], minDistance: 50.0});
    let points = generator.fill();
    let delaunator = Delaunator.from(points);
    for (let e1 = 0; e1 < delaunator.halfedges.length; e1++) {
        var e2 = delaunator.halfedges[e1];
        if (e2 !== -1 && delaunator.halfedges[e2] !== e1) {
            Test.fail("invalid halfedge connection; data set was " + JSON.stringify(points));
            return;
        }
    }
    Test.pass("halfedges are valid");
}



testStructuralInvariants();
testHalfEdges1();
testHalfEdges2();
