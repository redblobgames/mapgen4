/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

'use strict';

let tape = require('tape');
let Delaunator = require('delaunator');
let Poisson = require('poisson-disk-sampling');
let TriangleMesh = require('./');
let MeshBuilder = require('./create');


tape("structural invariants", function(test) {
    let mesh = new MeshBuilder({boundarySpacing: 450})
        .addPoisson(Poisson, 450)
        .create(true);
    
    let s_out = [];
    for (let s1 = 0; s1 < mesh.numSides; s1++) {
        let s2 = mesh.s_opposite_s(s1);
        test.equal(mesh.s_opposite_s(s2), s1);
        test.equal(mesh.s_begin_r(s1), mesh.s_end_r(s2));
        test.equal(mesh.s_inner_t(s1), mesh.s_outer_t(s2));
        test.equal(mesh.s_begin_r(mesh.s_next_s(s1)), mesh.s_begin_r(s2));
    }
    for (let r = 0; r < mesh.numRegions; r++) {
        mesh.r_circulate_s(s_out, r);
        for (let s of s_out) {
            test.equal(mesh.s_begin_r(s), r);
        }
    }
    for (let t = 0; t < mesh.numTriangles; t++) {
        mesh.t_circulate_s(s_out, t);
        for (let s of s_out) {
            test.equal(mesh.s_inner_t(s), t);
        }
    }
    
    test.end();
});



tape("delaunator: properly connected halfedges", function(t) {
    let points = [[122,270],[181,121],[195,852],[204,694],[273,525],[280,355],[31,946],[319,938],[33,625],[344,93],[369,793],[38,18],[426,539],[454,239],[503,51],[506,997],[516,661],[532,386],[619,889],[689,131],[730,511],[747,750],[760,285],[856,83],[88,479],[884,943],[927,696],[960,472],[992,253]];
    points = points.map((p) => [p[0] + Math.random(), p[1]]);
    var d = Delaunator.from(points);
    for (var i = 0; i < d.halfedges.length; i++) {
        var i2 = d.halfedges[i];
        if (i2 !== -1 && d.halfedges[i2] !== i) {
            t.fail('invalid halfedge connection');
        }
    }
    t.pass('halfedges are valid');
    t.end();
});

tape("delaunator: properly connected halfedges, random set", function(test) {
    // NOTE: this is not a great test because the input data is
    // different each time; need to switch to a deterministic random
    // number generator
    let generator = new Poisson({shape: [1000, 1000], minDistance: 50.0});
    let points = generator.fill();
    let delaunator = Delaunator.from(points);
    for (let e1 = 0; e1 < delaunator.halfedges.length; e1++) {
        var e2 = delaunator.halfedges[e1];
        if (e2 !== -1 && delaunator.halfedges[e2] !== e1) {
            test.fail("invalid halfedge connection; data set was " + JSON.stringify(points));
        }
    }
    test.pass("halfedges are valid");
    test.end();
});
