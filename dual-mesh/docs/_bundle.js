(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Generate a random triangle mesh for the area 0 <= x <= 1000, 0 <= y <= 1000
 *
 * This program runs on the command line (node)
 */

'use strict';

let Delaunator   = require('delaunator');        // ISC licensed
let TriangleMesh = require('./');

function s_next_s(s) { return (s % 3 == 2) ? s-2 : s+1; }


function checkPointInequality({_r_vertex, _triangles, _halfedges}) {
    // TODO: check for collinear vertices. Around each red point P if
    // there's a point Q and R both connected to it, and the angle P→Q and
    // the angle P→R are 180° apart, then there's collinearity. This would
    // indicate an issue with poisson disc point selection.
}


function checkTriangleInequality({_r_vertex, _triangles, _halfedges}) {
    // check for skinny triangles
    const badAngleLimit = 30;
    let summary = new Array(badAngleLimit).fill(0);
    let count = 0;
    for (let s = 0; s < _triangles.length; s++) {
        let r0 = _triangles[s],
            r1 = _triangles[s_next_s(s)],
            r2 = _triangles[s_next_s(s_next_s(s))];
        let p0 = _r_vertex[r0],
            p1 = _r_vertex[r1],
            p2 = _r_vertex[r2];
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


function checkMeshConnectivity({_r_vertex, _triangles, _halfedges}) {
    // 1. make sure each side's opposite is back to itself
    // 2. make sure region-circulating starting from each side works
    let ghost_r = _r_vertex.length - 1, out_s = [];
    for (let s0 = 0; s0 < _triangles.length; s0++) {
        if (_halfedges[_halfedges[s0]] !== s0) {
            console.log(`FAIL _halfedges[_halfedges[${s0}]] !== ${s0}`);
        }
        let s = s0, count = 0;
        out_s.length = 0;
        do {
            count++; out_s.push(s);
            s = s_next_s(_halfedges[s]);
            if (count > 100 && _triangles[s0] !== ghost_r) {
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
function addBoundaryPoints(spacing, size) {
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


function addGhostStructure({_r_vertex, _triangles, _halfedges}) {
    const numSolidSides = _triangles.length;
    const ghost_r = _r_vertex.length;
    
    let numUnpairedSides = 0, firstUnpairedEdge = -1;
    let r_unpaired_s = []; // seed to side
    // TODO: get these from the delaunator hull
    for (let s = 0; s < numSolidSides; s++) {
        if (_halfedges[s] === -1) {
            numUnpairedSides++;
            r_unpaired_s[_triangles[s]] = s;
            firstUnpairedEdge = s;
        }
    }

    let r_newvertex = _r_vertex.concat([[500, 500]]);
    let s_newstart_r = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    s_newstart_r.set(_triangles);
    let s_newopposite_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
    s_newopposite_s.set(_halfedges);

    for (let i = 0, s = firstUnpairedEdge;
         i < numUnpairedSides;
         i++, s = r_unpaired_s[s_newstart_r[s_next_s(s)]]) {

        // Construct a ghost side for s
        let ghost_s = numSolidSides + 3 * i;
        s_newopposite_s[s] = ghost_s;
        s_newopposite_s[ghost_s] = s;
        s_newstart_r[ghost_s] = s_newstart_r[s_next_s(s)];
        
        // Construct the rest of the ghost triangle
        s_newstart_r[ghost_s + 1] = s_newstart_r[s];
        s_newstart_r[ghost_s + 2] = ghost_r;
        let k = numSolidSides + (3 * i + 4) % (3 * numUnpairedSides);
        s_newopposite_s[ghost_s + 2] = k;
        s_newopposite_s[k] = ghost_s + 2;
    }

    return {
        numSolidSides,
        _r_vertex: r_newvertex,
        _triangles: s_newstart_r,
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
class MeshBuilder {
    /** If boundarySpacing > 0 there will be a boundary added around the 1000x1000 area */
    constructor ({boundarySpacing=0} = {}) {
        let boundaryPoints = boundarySpacing > 0 ? addBoundaryPoints(boundarySpacing, 1000) : [];
        this.points = boundaryPoints;
        this.numBoundaryRegions = boundaryPoints.length;
    }

    /** Points should be [x, y] */
    addPoints(newPoints) {
        this.points.push.apply(this.points, newPoints);
        return this;
    }

    /** Pass in the constructor from the poisson-disk-sampling module */
    addPoisson(Poisson, spacing, random=Math.random) {
        let generator = new Poisson([1000, 1000], spacing, undefined, undefined, random);
        this.points.forEach(p => generator.addPoint(p));
        this.points = generator.fill();
        return this;
    }

    /** Build and return a TriangleMesh */
    create(runChecks=false) {
        // TODO: use Float32Array instead of this, so that we can
        // construct directly from points read in from a file
        let delaunator = Delaunator.from(this.points);
        let graph = {
            _r_vertex: this.points,
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


module.exports = MeshBuilder;

},{"./":3,"delaunator":4}],2:[function(require,module,exports){
/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

let DualMesh = require('../');
let MeshBuilder = require('../create');
let Poisson = require('poisson-disk-sampling');

const seeds1 = [
    [250, 30], [100, 260], [400, 260], [550, 30]
];

const seeds2 = [
    [320, 170], [220, 270], [400, 270],
    [530, 50], [100, 80], [300, 30],
    [50, 220], [550, 240],
];

let G0 = new MeshBuilder({boundarySpacing: 75})
    .addPoisson(Poisson, 50)
    .create();
let G1 = new MeshBuilder()
    .addPoints(seeds1)
    .create();
let G2 = new MeshBuilder()
    .addPoints(seeds2)
    .create();


function interpolate(p, q, t) {
    return [p[0] * (1-t) + q[0] * t, p[1] * (1-t) + q[1] * t];
}

function extrapolate_from_center(p, center) {
    let dx = p[0] - center[0], dy = p[1] - center[1];
    return [center[0] + dx*5, center[1] + dy*5];
}

/** Label placed near a reference point. */
Vue.component('a-label', {
    props: ['at', 'dx', 'dy'],
    template: '<text :transform="`translate(${at})`" :dx="dx || 0" :dy="dy || 0"><slot/></text>'
});

Vue.component('a-side-black-edges', {
    props: ['graph', 'alpha'],
    template: `
    <g>
      <path v-for="(_,s) in graph.numSides" :key="s"
         :class="'b-side' + (graph.s_ghost(s)? ' ghost' : '')"
         :d="b_side(s)"/>
    </g>
`,
    methods: {
        b_side: function(s) {
            const alpha = this.alpha || 0.0;
            let begin = this.graph.r_pos([], this.graph.s_begin_r(s));
            let end = this.graph.r_pos([], this.graph.s_end_r(s));
            if (this.graph.r_ghost(this.graph.s_begin_r(s))) {
                begin = extrapolate_from_center(end, [300, 150]);
            } else if (this.graph.r_ghost(this.graph.s_end_r(s))) {
                end = extrapolate_from_center(begin, [300, 150]);
            }
            let center = this.graph.t_pos([], this.graph.s_inner_t(s));
            begin = interpolate(begin, center, alpha);
            end = interpolate(end, center, alpha);
            return `M ${begin} L ${end}`;
        },
    }
});

Vue.component('a-side-white-edges', {
    props: ['graph', 'alpha'],
    template: `
    <g>
      <path v-for="(_,s) in graph.numSides" :key="s"
        :class="'w-side' + ((graph.t_ghost(graph.s_outer_t(s)) || graph.s_ghost(s))? ' ghost' : '')"
        :d="w_side(s)"/>
    </g>
`,
    methods: {
        w_side: function(s) {
            const alpha = this.alpha || 0.0;
            let begin = this.graph.t_pos([], this.graph.s_inner_t(s));
            let end = this.graph.t_pos([], this.graph.s_outer_t(s));
            let center = this.graph.r_pos([], this.graph.s_begin_r(s));
            begin = interpolate(begin, center, alpha);
            end = interpolate(end, center, alpha);
            return `M ${begin} L ${end}`;
        },
    }
});

Vue.component('a-side-labels', {
    props: ['graph'],
    template: `
    <g>
      <a-label v-for="(_,s) in graph.numSolidSides" :key="s"
        class="s" 
        dy="7"
        :at="interpolate(graph.r_pos([], graph.s_begin_r(s)), 
                         graph.t_pos([], graph.s_inner_t(s)),
                         0.4)">
      s{{s}}
      </a-label>
    </g>
`,
    methods: {interpolate},
});
              
Vue.component('a-region-points', {
    props: ['graph', 'hover', 'radius'],
    template: `
    <g>
      <circle v-for="(_,r) in graph.numSolidRegions" :key="r"
        class="r"
        :r="radius || 10"
        @mouseover="hover('r'+r)" 
        @touchstart.passive="hover('r'+r)"
        :transform="\`translate($\{graph.r_pos([], r)})\`"/>
    </g>
`,
});

Vue.component('a-region-labels', {
    props: ['graph'],
    template: `
    <g>
      <a-label v-for="(_,r) in graph.numSolidRegions" :key="r"
        class="r" 
        :dy="graph.r_y(r) > 150? 25 : -15" :at="graph.r_pos([], r)">
        r{{r}}
      </a-label>
    </g>
`,
});

Vue.component('a-triangle-points', {
    props: ['graph', 'hover', 'radius'],
    template: `
      <g>
        <circle v-for="(_,t) in graph.numTriangles" :key="t"
          :class="'t' + (graph.t_ghost(t)? ' ghost':'')" 
          :r="radius || 7"
          @mouseover="hover('t'+t)" 
          @touchstart.passive="hover('t'+t)"
          :transform="\`translate($\{graph.t_pos([], t)})\`"/>
      </g>
`,
});

Vue.component('a-triangle-labels', {
    props: ['graph'],
    template: `
      <g>
        <a-label v-for="(_,t) in graph.numSolidTriangles" :key="t"
          class="t" 
          dy="25" 
          :at="graph.t_pos([], t)">
          t{{t}}
        </a-label>
      </g>
`,
});

function makeDiagram(selector, graph) {
    new Vue({
        el: selector,
        data: {
            graph: Object.freeze(graph),
            highlight: '',
        },
        computed: {
            highlightId: function() {
                return parseInt(this.highlight.slice(1));
            },
        },
        methods: {
            hover: function(label) {
                this.highlight = label;
            },
            format_array: function(label, array) {
                return array.map((x) => (x === null || x < 0)? '(null)' : label+x).join(" ");
            },
        }
    });
}

for (let diagram of document.querySelectorAll("div.diagram-g0")) {
    makeDiagram(diagram, G0);
}
for (let diagram of document.querySelectorAll("div.diagram-g1")) {
    makeDiagram(diagram, G1);
}
for (let diagram of document.querySelectorAll("div.diagram-g2")) {
    makeDiagram(diagram, G2);
}

},{"../":3,"../create":1,"poisson-disk-sampling":9}],3:[function(require,module,exports){
/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

'use strict';

/**
 * Represent a triangle-polygon dual mesh with:
 *   - Regions (r)
 *   - Sides (s)
 *   - Triangles (t)
 *
 * Each element has an id:
 *   - 0 <= r < numRegions
 *   - 0 <= s < numSides
 *   - 0 <= t < numTriangles
 *
 * Naming convention: x_name_y takes x (r, s, t) as input and produces
 * y (r, s, t) as output. If the output isn't a mesh index (r, s, t)
 * then the _y suffix is omitted.
 *
 * A side is directed. If two triangles t0, t1 are adjacent, there will
 * be two sides representing the boundary, one for t0 and one for t1. These
 * can be accessed with s_inner_t and s_outer_t.
 *
 * A side also represents the boundary between two regions. If two regions
 * r0, r1 are adjacent, there will be two sides representing the boundary,
 * s_begin_r and s_end_r.
 *
 * Each side will have a pair, accessed with s_opposite_s.
 *
 * The mesh has no boundaries; it wraps around the "back" using a
 * "ghost" region. Some regions are marked as the boundary; these are
 * connected to the ghost region. Ghost triangles and ghost sides
 * connect these boundary regions to the ghost region. Elements that
 * aren't "ghost" are called "solid".
 */
class TriangleMesh {
    static s_to_t(s)   { return (s/3) | 0; }
    static s_prev_s(s) { return (s % 3 == 0) ? s+2 : s-1; }
    static s_next_s(s) { return (s % 3 == 2) ? s-2 : s+1; }

    /**
     * constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in deserialize.js
     */
    constructor ({numBoundaryRegions, numSolidSides, _r_vertex, _triangles, _halfedges}) {
        Object.assign(this, {numBoundaryRegions, numSolidSides,
                             _r_vertex, _triangles, _halfedges});

        this.numSides = _triangles.length;
        this.numRegions = _r_vertex.length;
        this.numSolidRegions = this.numRegions - 1;
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;
        
        // Construct an index for finding sides connected to a region
        this._r_any_s = new Int32Array(this.numRegions);
        for (let s = 0; s < _triangles.length; s++) {
            this._r_any_s[_triangles[s]] = this._r_any_s[_triangles[s]] || s;
        }

        // Construct triangle coordinates
        this._t_vertex = new Array(this.numTriangles);
        for (let s = 0; s < _triangles.length; s += 3) {
            let a = _r_vertex[_triangles[s]],
                b = _r_vertex[_triangles[s+1]],
                c = _r_vertex[_triangles[s+2]];
            if (this.s_ghost(s)) {
                // ghost triangle center is just outside the unpaired side
                let dx = b[0]-a[0], dy = b[1]-a[1];
                this._t_vertex[s/3] = [a[0] + 0.5*(dx+dy), a[1] + 0.5*(dy-dx)];
            } else {
                // solid triangle center is at the centroid
                this._t_vertex[s/3] = [(a[0] + b[0] + c[0])/3,
                                     (a[1] + b[1] + c[1])/3];
            }
        }
    }

    r_x(r)        { return this._r_vertex[r][0]; }
    r_y(r)        { return this._r_vertex[r][1]; }
    t_x(r)        { return this._t_vertex[r][0]; }
    t_y(r)        { return this._t_vertex[r][1]; }
    r_pos(out, r) { out.length = 2; out[0] = this.r_x(r); out[1] = this.r_y(r); return out; }
    t_pos(out, t) { out.length = 2; out[0] = this.t_x(t); out[1] = this.t_y(t); return out; }
    
    s_begin_r(s)  { return this._triangles[s]; }
    s_end_r(s)    { return this._triangles[TriangleMesh.s_next_s(s)]; }

    s_inner_t(s)  { return TriangleMesh.s_to_t(s); }
    s_outer_t(s)  { return TriangleMesh.s_to_t(this._halfedges[s]); }

    s_next_s(s)   { return TriangleMesh.s_next_s(s); }
    s_prev_s(s)   { return TriangleMesh.s_prev_s(s); }
    
    s_opposite_s(s) { return this._halfedges[s]; }
    
    t_circulate_s(out_s, t) { out_s.length = 3; for (let i = 0; i < 3; i++) { out_s[i] = 3*t + i; } return out_s; }
    t_circulate_r(out_r, t) { out_r.length = 3; for (let i = 0; i < 3; i++) { out_r[i] = this._triangles[3*t+i]; } return out_r; }
    t_circulate_t(out_t, t) { out_t.length = 3; for (let i = 0; i < 3; i++) { out_t[i] = this.s_outer_t(3*t+i); } return out_t; }
    
    r_circulate_s(out_s, r) {
        const s0 = this._r_any_s[r];
        let s = s0;
        out_s.length = 0;
        do {
            out_s.push(s);
            s = TriangleMesh.s_next_s(this._halfedges[s]);
        } while (s != s0);
        return out_s;
    }

    r_circulate_r(out_r, r) {
        const s0 = this._r_any_s[r];
        let s = s0;
        out_r.length = 0;
        do {
            out_r.push(this.s_end_r(s));
            s = TriangleMesh.s_next_s(this._halfedges[s]);
        } while (s != s0);
        return out_r;
    }
    
    r_circulate_t(out_t, r) {
        const s0 = this._r_any_s[r];
        let s = s0;
        out_t.length = 0;
        do {
            out_t.push(TriangleMesh.s_to_t(s));
            s = TriangleMesh.s_next_s(this._halfedges[s]);
        } while (s != s0);
        return out_t;
    }

    ghost_r()     { return this.numRegions - 1; }
    s_ghost(s)    { return s >= this.numSolidSides; }
    r_ghost(r)    { return r == this.numRegions - 1; }
    t_ghost(t)    { return this.s_ghost(3 * t); }
    s_boundary(s) { return this.s_ghost(s) && (s % 3 == 0); }
    r_boundary(r) { return r < this.numBoundaryRegions; }
}

module.exports = TriangleMesh;

},{}],4:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global.Delaunator = factory());
}(this, (function () { 'use strict';

    Delaunator.from = function (points, getX, getY) {
        if (!getX) getX = defaultGetX;
        if (!getY) getY = defaultGetY;

        var n = points.length;
        var coords = new Float64Array(n * 2);

        for (var i = 0; i < n; i++) {
            var p = points[i];
            coords[2 * i] = getX(p);
            coords[2 * i + 1] = getY(p);
        }

        return new Delaunator(coords);
    };

    function Delaunator(coords) {
        if (!ArrayBuffer.isView(coords)) throw new Error('Expected coords to be a typed array.');

        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;

        var n = coords.length >> 1;
        var ids = this.ids = new Uint32Array(n);

        this.coords = coords;

        for (var i = 0; i < n; i++) {
            var x = coords[2 * i];
            var y = coords[2 * i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            ids[i] = i;
        }

        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;

        var minDist = Infinity;
        var i0, i1, i2;

        // pick a seed point close to the centroid
        for (i = 0; i < n; i++) {
            var d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
            if (d < minDist) {
                i0 = i;
                minDist = d;
            }
        }

        minDist = Infinity;

        // find the point closest to the seed
        for (i = 0; i < n; i++) {
            if (i === i0) continue;
            d = dist(coords[2 * i0], coords[2 * i0 + 1], coords[2 * i], coords[2 * i + 1]);
            if (d < minDist && d > 0) {
                i1 = i;
                minDist = d;
            }
        }

        var minRadius = Infinity;

        // find the third point which forms the smallest circumcircle with the first two
        for (i = 0; i < n; i++) {
            if (i === i0 || i === i1) continue;

            var r = circumradius(
                coords[2 * i0], coords[2 * i0 + 1],
                coords[2 * i1], coords[2 * i1 + 1],
                coords[2 * i], coords[2 * i + 1]);

            if (r < minRadius) {
                i2 = i;
                minRadius = r;
            }
        }

        if (minRadius === Infinity) {
            throw new Error('No Delaunay triangulation exists for this input.');
        }

        // swap the order of the seed points for counter-clockwise orientation
        if (area(coords[2 * i0], coords[2 * i0 + 1],
            coords[2 * i1], coords[2 * i1 + 1],
            coords[2 * i2], coords[2 * i2 + 1]) < 0) {

            var tmp = i1;
            i1 = i2;
            i2 = tmp;
        }

        var i0x = coords[2 * i0];
        var i0y = coords[2 * i0 + 1];
        var i1x = coords[2 * i1];
        var i1y = coords[2 * i1 + 1];
        var i2x = coords[2 * i2];
        var i2y = coords[2 * i2 + 1];

        var center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
        this._cx = center.x;
        this._cy = center.y;

        // sort the points by distance from the seed triangle circumcenter
        quicksort(ids, coords, 0, ids.length - 1, center.x, center.y);

        // initialize a hash table for storing edges of the advancing convex hull
        this._hashSize = Math.ceil(Math.sqrt(n));
        this._hash = [];
        for (i = 0; i < this._hashSize; i++) this._hash[i] = null;

        // initialize a circular doubly-linked list that will hold an advancing convex hull
        var e = this.hull = insertNode(coords, i0);
        this._hashEdge(e);
        e.t = 0;
        e = insertNode(coords, i1, e);
        this._hashEdge(e);
        e.t = 1;
        e = insertNode(coords, i2, e);
        this._hashEdge(e);
        e.t = 2;

        var maxTriangles = 2 * n - 5;
        var triangles = this.triangles = new Uint32Array(maxTriangles * 3);
        var halfedges = this.halfedges = new Int32Array(maxTriangles * 3);

        this.trianglesLen = 0;

        this._addTriangle(i0, i1, i2, -1, -1, -1);

        var xp, yp;
        for (var k = 0; k < ids.length; k++) {
            i = ids[k];
            x = coords[2 * i];
            y = coords[2 * i + 1];

            // skip duplicate points
            if (x === xp && y === yp) continue;
            xp = x;
            yp = y;

            // skip seed triangle points
            if ((x === i0x && y === i0y) ||
                (x === i1x && y === i1y) ||
                (x === i2x && y === i2y)) continue;

            // find a visible edge on the convex hull using edge hash
            var startKey = this._hashKey(x, y);
            var key = startKey;
            var start;
            do {
                start = this._hash[key];
                key = (key + 1) % this._hashSize;
            } while ((!start || start.removed) && key !== startKey);

            e = start;
            while (area(x, y, e.x, e.y, e.next.x, e.next.y) >= 0) {
                e = e.next;
                if (e === start) {
                    throw new Error('Something is wrong with the input points.');
                }
            }

            var walkBack = e === start;

            // add the first triangle from the point
            var t = this._addTriangle(e.i, i, e.next.i, -1, -1, e.t);

            e.t = t; // keep track of boundary triangles on the hull
            e = insertNode(coords, i, e);

            // recursively flip triangles from the point until they satisfy the Delaunay condition
            e.t = this._legalize(t + 2);
            if (e.prev.prev.t === halfedges[t + 1]) {
                e.prev.prev.t = t + 2;
            }

            // walk forward through the hull, adding more triangles and flipping recursively
            var q = e.next;
            while (area(x, y, q.x, q.y, q.next.x, q.next.y) < 0) {
                t = this._addTriangle(q.i, i, q.next.i, q.prev.t, -1, q.t);
                q.prev.t = this._legalize(t + 2);
                this.hull = removeNode(q);
                q = q.next;
            }

            if (walkBack) {
                // walk backward from the other side, adding more triangles and flipping
                q = e.prev;
                while (area(x, y, q.prev.x, q.prev.y, q.x, q.y) < 0) {
                    t = this._addTriangle(q.prev.i, i, q.i, -1, q.t, q.prev.t);
                    this._legalize(t + 2);
                    q.prev.t = t;
                    this.hull = removeNode(q);
                    q = q.prev;
                }
            }

            // save the two new edges in the hash table
            this._hashEdge(e);
            this._hashEdge(e.prev);
        }

        // trim typed triangle mesh arrays
        this.triangles = triangles.subarray(0, this.trianglesLen);
        this.halfedges = halfedges.subarray(0, this.trianglesLen);
    }

    Delaunator.prototype = {

        _hashEdge: function (e) {
            this._hash[this._hashKey(e.x, e.y)] = e;
        },

        _hashKey: function (x, y) {
            var dx = x - this._cx;
            var dy = y - this._cy;
            // use pseudo-angle: a measure that monotonically increases
            // with real angle, but doesn't require expensive trigonometry
            var p = 1 - dx / (Math.abs(dx) + Math.abs(dy));
            return Math.floor((2 + (dy < 0 ? -p : p)) / 4 * this._hashSize);
        },

        _legalize: function (a) {
            var triangles = this.triangles;
            var coords = this.coords;
            var halfedges = this.halfedges;

            var b = halfedges[a];

            var a0 = a - a % 3;
            var b0 = b - b % 3;

            var al = a0 + (a + 1) % 3;
            var ar = a0 + (a + 2) % 3;
            var bl = b0 + (b + 2) % 3;

            var p0 = triangles[ar];
            var pr = triangles[a];
            var pl = triangles[al];
            var p1 = triangles[bl];

            var illegal = inCircle(
                coords[2 * p0], coords[2 * p0 + 1],
                coords[2 * pr], coords[2 * pr + 1],
                coords[2 * pl], coords[2 * pl + 1],
                coords[2 * p1], coords[2 * p1 + 1]);

            if (illegal) {
                triangles[a] = p1;
                triangles[b] = p0;

                this._link(a, halfedges[bl]);
                this._link(b, halfedges[ar]);
                this._link(ar, bl);

                var br = b0 + (b + 1) % 3;

                this._legalize(a);
                return this._legalize(br);
            }

            return ar;
        },

        _link: function (a, b) {
            this.halfedges[a] = b;
            if (b !== -1) this.halfedges[b] = a;
        },

        // add a new triangle given vertex indices and adjacent half-edge ids
        _addTriangle: function (i0, i1, i2, a, b, c) {
            var t = this.trianglesLen;

            this.triangles[t] = i0;
            this.triangles[t + 1] = i1;
            this.triangles[t + 2] = i2;

            this._link(t, a);
            this._link(t + 1, b);
            this._link(t + 2, c);

            this.trianglesLen += 3;

            return t;
        }
    };

    function dist(ax, ay, bx, by) {
        var dx = ax - bx;
        var dy = ay - by;
        return dx * dx + dy * dy;
    }

    function area(px, py, qx, qy, rx, ry) {
        return (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
    }

    function inCircle(ax, ay, bx, by, cx, cy, px, py) {
        ax -= px;
        ay -= py;
        bx -= px;
        by -= py;
        cx -= px;
        cy -= py;

        var ap = ax * ax + ay * ay;
        var bp = bx * bx + by * by;
        var cp = cx * cx + cy * cy;

        return ax * (by * cp - bp * cy) -
               ay * (bx * cp - bp * cx) +
               ap * (bx * cy - by * cx) < 0;
    }

    function circumradius(ax, ay, bx, by, cx, cy) {
        bx -= ax;
        by -= ay;
        cx -= ax;
        cy -= ay;

        var bl = bx * bx + by * by;
        var cl = cx * cx + cy * cy;

        if (bl === 0 || cl === 0) return Infinity;

        var d = bx * cy - by * cx;
        if (d === 0) return Infinity;

        var x = (cy * bl - by * cl) * 0.5 / d;
        var y = (bx * cl - cx * bl) * 0.5 / d;

        return x * x + y * y;
    }

    function circumcenter(ax, ay, bx, by, cx, cy) {
        bx -= ax;
        by -= ay;
        cx -= ax;
        cy -= ay;

        var bl = bx * bx + by * by;
        var cl = cx * cx + cy * cy;

        var d = bx * cy - by * cx;

        var x = (cy * bl - by * cl) * 0.5 / d;
        var y = (bx * cl - cx * bl) * 0.5 / d;

        return {
            x: ax + x,
            y: ay + y
        };
    }

    // create a new node in a doubly linked list
    function insertNode(coords, i, prev) {
        var node = {
            i: i,
            x: coords[2 * i],
            y: coords[2 * i + 1],
            t: 0,
            prev: null,
            next: null,
            removed: false
        };

        if (!prev) {
            node.prev = node;
            node.next = node;

        } else {
            node.next = prev.next;
            node.prev = prev;
            prev.next.prev = node;
            prev.next = node;
        }
        return node;
    }

    function removeNode(node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
        node.removed = true;
        return node.prev;
    }

    function quicksort(ids, coords, left, right, cx, cy) {
        var i, j, temp;

        if (right - left <= 20) {
            for (i = left + 1; i <= right; i++) {
                temp = ids[i];
                j = i - 1;
                while (j >= left && compare(coords, ids[j], temp, cx, cy) > 0) ids[j + 1] = ids[j--];
                ids[j + 1] = temp;
            }
        } else {
            var median = (left + right) >> 1;
            i = left + 1;
            j = right;
            swap(ids, median, i);
            if (compare(coords, ids[left], ids[right], cx, cy) > 0) swap(ids, left, right);
            if (compare(coords, ids[i], ids[right], cx, cy) > 0) swap(ids, i, right);
            if (compare(coords, ids[left], ids[i], cx, cy) > 0) swap(ids, left, i);

            temp = ids[i];
            while (true) {
                do i++; while (compare(coords, ids[i], temp, cx, cy) < 0);
                do j--; while (compare(coords, ids[j], temp, cx, cy) > 0);
                if (j < i) break;
                swap(ids, i, j);
            }
            ids[left + 1] = ids[j];
            ids[j] = temp;

            if (right - i + 1 >= j - left) {
                quicksort(ids, coords, i, right, cx, cy);
                quicksort(ids, coords, left, j - 1, cx, cy);
            } else {
                quicksort(ids, coords, left, j - 1, cx, cy);
                quicksort(ids, coords, i, right, cx, cy);
            }
        }
    }

    function compare(coords, i, j, cx, cy) {
        var d1 = dist(coords[2 * i], coords[2 * i + 1], cx, cy);
        var d2 = dist(coords[2 * j], coords[2 * j + 1], cx, cy);
        return (d1 - d2) || (coords[2 * i] - coords[2 * j]) || (coords[2 * i + 1] - coords[2 * j + 1]);
    }

    function swap(arr, i, j) {
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    function defaultGetX(p) {
        return p[0];
    }
    function defaultGetY(p) {
        return p[1];
    }

    return Delaunator;

})));

},{}],5:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],6:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],7:[function(require,module,exports){
module.exports = moore

function moore(range, dims) {
  dims = dims || 2
  range = range || 1
  return recurse([], [], 0)

  function recurse(array, temp, d) {
    if (d === dims-1) {
      for (var i = -range; i <= range; i += 1) {
        if (i || temp.some(function(n) {
          return n
        })) array.push(temp.concat(i))
      }
    } else {
      for (var i = -range; i <= range; i += 1) {
        recurse(array, temp.concat(i), d+1)
      }
    }
    return array
  }
}

},{}],8:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":5,"is-buffer":6}],9:[function(require,module,exports){
"use strict";

module.exports = require('./src/poisson-disk-sampling');

},{"./src/poisson-disk-sampling":11}],10:[function(require,module,exports){
"use strict";

module.exports = function euclideanDistanceN (point1, point2) {
    var result = 0,
        i = 0;

    for (; i < point1.length; i++) {
        result += Math.pow(point1[i] - point2[i], 2);
    }

    return Math.sqrt(result);
};

},{}],11:[function(require,module,exports){
"use strict";

var zeros = require('zeros'),
    moore = require('moore'),
    euclideanDistanceN = require('./euclidean-distance'),
    sphereRandom = require('./sphere-random');

/**
 * Get the neighbourhood ordered by distance, including the origin point
 * @param {int} dimensionNumber Number of dimensions
 * @returns {Array} Neighbourhood
 */
var getNeighbourhood = function getNeighbourhood (dimensionNumber) {
    var neighbourhood = moore(2, dimensionNumber),
        origin = [],
        dimension;

    for (dimension = 0; dimension < dimensionNumber; dimension++) {
        origin.push(0);
    }

    neighbourhood.push(origin);

    // sort by ascending distance to optimize proximity checks
    // see point 5.1 in Parallel Poisson Disk Sampling by Li-Yi Wei, 2008
    // http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.460.3061&rank=1
    neighbourhood.sort(function (n1, n2) {
        var squareDist1 = 0,
            squareDist2 = 0;

        for (var dimension = 0; dimension < dimensionNumber; dimension++) {
            squareDist1 += Math.pow(n1[dimension], 2);
            squareDist2 += Math.pow(n2[dimension], 2);
        }

        if (squareDist1 < squareDist2) {
            return -1;
        } else if(squareDist1 > squareDist2) {
            return 1;
        } else {
            return 0;
        }
    });

    return neighbourhood;
};


/**
 * PoissonDiskSampling constructor
 * @param {Array} shape Shape of the space
 * @param {float} minDistance Minimum distance between each points
 * @param {float} [maxDistance] Maximum distance between each points, defaults to minDistance * 2
 * @param {int} [maxTries] Number of times the algorithm has to try to place a point in the neighbourhood of another points, defaults to 30
 * @param {function|null} [rng] RNG function, defaults to Math.random
 * @constructor
 */
var PoissonDiskSampling = function PoissonDiskSampling (shape, minDistance, maxDistance, maxTries, rng) {
    maxDistance = maxDistance || minDistance * 2;

    this.shape = shape;
    this.dimension = this.shape.length;
    this.minDistance = minDistance;
    this.deltaDistance = maxDistance - minDistance;
    this.cellSize = minDistance / Math.sqrt(this.dimension);
    this.maxTries = maxTries || 30;
    this.rng = rng || Math.random;

    this.neighbourhood = getNeighbourhood(this.dimension);

    this.currentPoint = null;
    this.processList = [];
    this.samplePoints = [];

    // cache grid

    this.gridShape = [];

    for (var i = 0; i < this.dimension; i++) {
        this.gridShape.push(Math.ceil(shape[i] / this.cellSize));
    }

    this.grid = zeros(this.gridShape, 'uint32'); //will store references to samplePoints
};

PoissonDiskSampling.prototype.shape = null;
PoissonDiskSampling.prototype.dimension = null;
PoissonDiskSampling.prototype.minDistance = null;
PoissonDiskSampling.prototype.deltaDistance = null;
PoissonDiskSampling.prototype.cellSize = null;
PoissonDiskSampling.prototype.maxTries = null;
PoissonDiskSampling.prototype.rng = null;
PoissonDiskSampling.prototype.neighbourhood = null;

PoissonDiskSampling.prototype.currentPoint = null;
PoissonDiskSampling.prototype.processList = null;
PoissonDiskSampling.prototype.samplePoints = null;
PoissonDiskSampling.prototype.gridShape = null;
PoissonDiskSampling.prototype.grid = null;

/**
 * Add a totally random point in the grid
 * @returns {Array} The point added to the grid
 */
PoissonDiskSampling.prototype.addRandomPoint = function () {
    var point = new Array(this.dimension);

    for (var i = 0; i < this.dimension; i++) {
        point[i] = this.rng() * this.shape[i];
    }

    return this.directAddPoint(point);
};

/**
 * Add a given point to the grid
 * @param {Array} point Point
 * @returns {Array|null} The point added to the grid, null if the point is out of the bound or not of the correct dimension
 */
PoissonDiskSampling.prototype.addPoint = function (point) {
    var dimension,
        valid = true;

    if (point.length === this.dimension) {
        for (dimension = 0; dimension < this.dimension && valid; dimension++) {
            valid = (point[dimension] >= 0 && point[dimension] <= this.shape[dimension]);
        }
    } else {
        valid = false;
    }

    return valid ? this.directAddPoint(point) : null;
};

/**
 * Add a given point to the grid, without any check
 * @param {Array} point Point
 * @returns {Array} The point added to the grid
 * @protected
 */
PoissonDiskSampling.prototype.directAddPoint = function (point) {
    var internalArrayIndex = 0,
        stride = this.grid.stride,
        dimension;

    this.processList.push(point);
    this.samplePoints.push(point);

    for (dimension = 0; dimension < this.dimension; dimension++) {
        internalArrayIndex += ((point[dimension] / this.cellSize) | 0) * stride[dimension];
    }

    this.grid.data[internalArrayIndex] = this.samplePoints.length; // store the point reference

    return point;
};

/**
 * Check whether a given point is in the neighbourhood of existing points
 * @param {Array} point Point
 * @returns {boolean} Whether the point is in the neighbourhood of another point
 * @protected
 */
PoissonDiskSampling.prototype.inNeighbourhood = function (point) {
    var dimensionNumber = this.dimension,
        stride = this.grid.stride,
        neighbourIndex,
        internalArrayIndex,
        dimension,
        currentDimensionValue,
        existingPoint;

    for (neighbourIndex = 0; neighbourIndex < this.neighbourhood.length; neighbourIndex++) {
        internalArrayIndex = 0;

        for (dimension = 0; dimension < dimensionNumber; dimension++) {
            currentDimensionValue = ((point[dimension] / this.cellSize) | 0) + this.neighbourhood[neighbourIndex][dimension];

            if (currentDimensionValue >= 0 && currentDimensionValue < this.gridShape[dimension]) {
                internalArrayIndex += currentDimensionValue * stride[dimension];
            }
        }

        if (this.grid.data[internalArrayIndex] !== 0) {
            existingPoint = this.samplePoints[this.grid.data[internalArrayIndex] - 1];

            if (euclideanDistanceN(point, existingPoint) < this.minDistance) {
                return true;
            }
        }
    }

    return false;
};

/**
 * Try to generate a new point in the grid, returns null if it wasn't possible
 * @returns {Array|null} The added point or null
 */
PoissonDiskSampling.prototype.next = function () {
    var tries,
        angle,
        distance,
        currentPoint,
        newPoint,
        inShape,
        i;

    while (this.processList.length > 0) {
        if (this.currentPoint === null) {
            this.currentPoint = this.processList.shift();
        }

        currentPoint = this.currentPoint;

        for (tries = 0; tries < this.maxTries; tries++) {
            inShape = true;
            distance = this.minDistance + this.deltaDistance * this.rng();

            if (this.dimension === 2) {
                angle = this.rng() * Math.PI * 2;
                newPoint = [
                    Math.cos(angle),
                    Math.sin(angle)
                ];
            } else {
                newPoint = sphereRandom(this.dimension, this.rng);
            }

            for (i = 0; inShape && i < this.dimension; i++) {
                newPoint[i] = currentPoint[i] + newPoint[i] * distance;
                inShape = (newPoint[i] >= 0 && newPoint[i] <= this.shape[i] - 1)
            }

            if (inShape && !this.inNeighbourhood(newPoint)) {
                return this.directAddPoint(newPoint);
            }
        }

        if (tries >= this.maxTries) {
            this.currentPoint = null;
        }
    }

    return null;
};

/**
 * Automatically fill the grid, adding a random point to start the process if needed.
 * Will block the thread, probably best to use it in a web worker or child process.
 * @returns {Array[]} Sample points
 */
PoissonDiskSampling.prototype.fill = function () {
    if (this.samplePoints.length === 0) {
        this.addRandomPoint();
    }

    while(this.next()) {}

    return this.samplePoints;
};

/**
 * Get all the points in the grid.
 * @returns {Array[]} Sample points
 */
PoissonDiskSampling.prototype.getAllPoints = function () {
    return this.samplePoints;
};

/**
 * Reinitialize the grid as well as the internal state
 */
PoissonDiskSampling.prototype.reset = function () {
    var gridData = this.grid.data,
        i = 0;

    // reset the cache grid
    for (i = 0; i < gridData.length; i++) {
        gridData[i] = 0;
    }

    // new array for the samplePoints as it is passed by reference to the outside
    this.samplePoints = [];

    // reset the internal state
    this.currentPoint = null;
    this.processList.length = 0;
};

module.exports = PoissonDiskSampling;

},{"./euclidean-distance":10,"./sphere-random":12,"moore":7,"zeros":13}],12:[function(require,module,exports){
"use strict";

// sphere-random module by Mikola Lysenko under the MIT License
// waiting for https://github.com/scijs/sphere-random/pull/1 to be merged

module.exports = sampleSphere;

var defaultRng = Math.random;

/**
 * @param {int} d Dimensions
 * @param {Function} [rng]
 * @returns {Array}
 */
function sampleSphere(d, rng) {
    var v = new Array(d),
        d2 = Math.floor(d/2) << 1,
        r2 = 0.0,
        rr,
        r,
        theta,
        h,
        i;

    rng = rng || defaultRng;

    for (i = 0; i < d2; i += 2) {
        rr = -2.0 * Math.log(rng());
        r =  Math.sqrt(rr);
        theta = 2.0 * Math.PI * rng();

        r2+= rr;
        v[i] = r * Math.cos(theta);
        v[i+1] = r * Math.sin(theta);
    }

    if (d % 2) {
        var x = Math.sqrt(-2.0 * Math.log(rng())) * Math.cos(2.0 * Math.PI * rng());
        v[d - 1] = x;
        r2+= Math.pow(x, 2);
    }

    h = 1.0 / Math.sqrt(r2);

    for (i=0; i<d; ++i) {
        v[i] *= h;
    }

    return v;
}

},{}],13:[function(require,module,exports){
"use strict"

var ndarray = require("ndarray")

function dtypeToType(dtype) {
  switch(dtype) {
    case 'uint8':
      return Uint8Array;
    case 'uint16':
      return Uint16Array;
    case 'uint32':
      return Uint32Array;
    case 'int8':
      return Int8Array;
    case 'int16':
      return Int16Array;
    case 'int32':
      return Int32Array;
    case 'float':
    case 'float32':
      return Float32Array;
    case 'double':
    case 'float64':
      return Float64Array;
    case 'uint8_clamped':
      return Uint8ClampedArray;
    case 'generic':
    case 'buffer':
    case 'data':
    case 'dataview':
      return ArrayBuffer;
    case 'array':
      return Array;
  }
}

module.exports = function zeros(shape, dtype) {
  dtype = dtype || 'float64';
  var sz = 1;
  for(var i=0; i<shape.length; ++i) {
    sz *= shape[i];
  }
  return ndarray(new (dtypeToType(dtype))(sz), shape);
}

},{"ndarray":8}]},{},[2]);
