/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

import Vue from "/mjs/vue.v2.browser.min.js";
import {Delaunator, Poisson} from "./build/_libs-for-docs.js";
import {TriangleMesh} from "./dist/index.js";
import {generateExteriorBoundaryPoints, generateInteriorBoundaryPoints} from "./dist/create.js";

const seeds1 = [
    [250, 30], [100, 269], [400, 270], [550, 31]
];

const seeds2 = [
    [320, 170], [220, 270], [400, 270],
    [530, 50], [100, 80], [300, 30],
    [50, 220], [550, 240],
];


function MeshBuilder(bounds, points, boundarySpacing, exteriorBoundaryToo=false) {
    let interiorBoundary = boundarySpacing? generateInteriorBoundaryPoints(bounds, boundarySpacing) : [];
    let exteriorBoundary = exteriorBoundaryToo? generateExteriorBoundaryPoints(bounds, boundarySpacing) : [];
    if (points === 'poisson') {
        let generator = new Poisson({
            shape: [bounds.width, bounds.height],
            minDistance: boundarySpacing / Math.sqrt(2),
        });
        for (let p of interiorBoundary) { generator.addPoint(p); }
        points = generator.fill();
    }

    points = exteriorBoundary.concat(points);
    let init = {
        points: exteriorBoundary.concat(points),
        delaunator: Delaunator.from(points),
        numBoundaryPoints: interiorBoundary.length + exteriorBoundary.length,
    };
    init = TriangleMesh.addGhostStructure(init);
    let mesh = new TriangleMesh(init);
    mesh._options = {bounds};

    // Change the ghost triangle positions for a better diagram
    const boundsDimensions = [bounds.width, bounds.height];
    const boundsCenter = [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
    for (let t = mesh.numSolidTriangles+1; t < mesh.numTriangles; t++) {
        let [a, b, c] = mesh.r_around_t(t).map((r) => mesh.pos_of_r(r));
        c = extrapolateFromCenter(interpolate(a, b, 0.5), boundsCenter, boundsDimensions);
        mesh._vertex_t[t][0] = (a[0] + b[0] + c[0])/3;
        mesh._vertex_t[t][1] = (a[1] + b[1] + c[1])/3;
    }
    
    return mesh;
}

let G0 = MeshBuilder({left: 0, top: 0, width: 1000, height: 1000}, 'poisson', 75);
let G1 = new MeshBuilder({left: -50, top: -25, width: 700, height: 350}, seeds1, null);
let G2 = new MeshBuilder({left: -50, top: -25, width: 700, height: 350}, seeds2, null);
let G3 = new MeshBuilder({left: 0, top: 0, width: 1000, height: 400}, 'poisson', 60);
let G4 = new MeshBuilder({left: 0, top: 0, width: 1000, height: 400}, 'poisson', 60, true);

/**
 * interpolate a point
 * 
 * @param {[number, number]} p - first point
 * @param {[number, number]} q - second point
 * @param {number} t - from 0 to 1 for interpolation, or outside for extrapolation
 * @returns {[number, number]}
 */
function interpolate(p, q, t) {
    return [p[0] * (1-t) + q[0] * t, p[1] * (1-t) + q[1] * t];
}

/**
 * figure out where to place the ghost region, based on which side it's connected to
 */
function coordinateForGhostRegion(graph, s) {
    // move ghost elements to the bounding region
    const bounds = graph._options.bounds;
    const boundsDimensions = [bounds.width, bounds.height];
    const boundsCenter = [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
    let p1 = graph.pos_of_r(graph.r_end_s(s));
    let p2 = graph.pos_of_r(graph.r_end_s(graph.s_next_s(s)));
    return extrapolateFromCenter(interpolate(p1, p2, 0.5), boundsCenter, boundsDimensions);
}

/**
 * figure out where to draw a (black) side
 */
function coordinatesForSide(graph, s, alpha) {
    let begin = graph.pos_of_r(graph.r_begin_s(s));
    let end = graph.pos_of_r(graph.r_end_s(s));
    let center = graph.pos_of_t(graph.t_inner_s(s));
    begin = interpolate(begin, center, alpha);
    end = interpolate(end, center, alpha);
    if (graph.is_ghost_r(graph.r_begin_s(s))) {
        begin = coordinateForGhostRegion(graph, s);
    } else if (graph.is_ghost_r(graph.r_end_s(s))) {
        end = coordinateForGhostRegion(graph, graph.s_next_s(s));
    }
    return {begin, end};
}

/**
 * return point on rectangle closest to the given point
 *
 * @param {[number, number]} p - point to extrapolate
 * @param {[number, number]} center
 * @param {[number, number]} dimensions - width, height
 * @returns {[number, number]}
 */
function extrapolateFromCenter(p, center, dimensions) {
    let dx = p[0] - center[0], dy = p[1] - center[1];
    let hw = dimensions[0]/2, hh = dimensions[1]/2;
    
    let candidates = [[dx, -hh], [dx, +hh], [-hw, dy], [+hw, dy]];
    candidates.sort((a, b) => Math.hypot(a[0]-dx, a[1]-dy) - Math.hypot(b[0]-dx, b[1]-dy));
    return [center[0] + candidates[0][0], center[1] + candidates[0][1]];
    // also see https://math.stackexchange.com/a/356813
}


/** Label placed near a reference point. */
Vue.component('a-label', {
    props: ['at', 'dx', 'dy'],
    template: '<text :transform="`translate(${at})`" :dx="dx || 0" :dy="dy || 0"><slot/></text>'
});

Vue.component('a-side-black-edges', {
    props: ['graph', 'alpha', 'show-synthetic'],
    template: `
    <g class="side-black-edges">
      <path v-for="(_,s) in graph.numSides" :key="s"
         :class="'b-side' + (graph.is_ghost_s(s)? ' ghost' : '')"
         :d="b_side(s)"/>
      <!-- HACK: put the synthetic region-points and region-labels here because they're already calculated -->
      <g v-if="showSynthetic" v-for="pos in allSyntheticRegionMarkers()"
         :transform="'translate(' + pos + ')'">
         <rect class="r" :x="-3" :y="-3" :width="2*3" :height="2*3" />
         <a-label class="r ghost" :at="labelPositionForSynthetic(pos)">r8</a-label>
      </g>
    </g>
`,
    methods: {
        labelPositionForSynthetic(pos) {
            const bounds = this.graph._options.bounds;
            if (pos[0] <= bounds.left) return [+20, 5];
            if (pos[0] >= bounds.left + bounds.width) return [-20, 5];
            if (pos[1] <= bounds.top) return [0, +20];
            if (pos[1] >= bounds.top + bounds.height) return [0, -10];
            return [0, 0]; // shouldn't happen
        },
        allSyntheticRegionMarkers() {
            const {graph} = this;
            let results = [];
            for (let s = graph.numSolidSides; s < graph.numSides; s++) {
                if (graph.is_ghost_r(graph.r_begin_s(s))) {
                    results.push(this.synthetic_region_location(s));
                }
            }
            return results;
        },
        synthetic_region_location(s) {
            return coordinateForGhostRegion(this.graph, s);
        },            
        b_side(s) {
            let {begin, end} = coordinatesForSide(this.graph, s, this.alpha ?? 0);
            return `M ${begin} L ${end}`;
        },
    }
});

Vue.component('a-side-white-edges', {
    props: ['graph', 'alpha'],
    template: `
    <g class="side-white-edges">
      <path v-for="(_,s) in graph.numSides" :key="s"
        :class="'w-side' + ((graph.is_ghost_t(graph.t_outer_s(s)) || graph.is_ghost_s(s))? ' ghost' : '')"
        :d="w_side(s)"/>
    </g>
`,
    methods: {
        w_side: function(s) {
            if (this.graph.is_ghost_s(s)) return ``;
            const alpha = this.alpha || 0.0;
            let begin = this.graph.pos_of_t(this.graph.t_inner_s(s));
            let end = this.graph.pos_of_t(this.graph.t_outer_s(s));
            let center = this.graph.pos_of_r(this.graph.r_begin_s(s));
            begin = interpolate(begin, center, alpha);
            end = interpolate(end, center, alpha);
            return `M ${begin} L ${end}`;
        },
    }
});

Vue.component('a-side-labels', {
    props: ['graph'],
    template: `
    <g class="side-labels">
      <a-label v-for="(_,s) in graph.numSides" :key="s"
        class="s" :class="{ghost: graph.is_ghost_s(s)}"
        dy="7"
        :at="location(s)">
      s{{s}}
      </a-label>
    </g>`,
    methods: {
        location(s) {
            let {begin, end} = coordinatesForSide(this.graph, s, 0.25);
            return interpolate(begin, end, 0.2);
        },
    },
});
              
Vue.component('a-region-points', {
    props: ['graph', 'hover', 'radius'],
    template: `
    <g class="region-points">
      <rect v-for="(_,r) in graph.numSolidRegions" :key="r"
            class="r" :class="{boundary: graph.is_boundary_r(r)}"
            :x="-radius" :y="-radius" :width="2*radius" :height="2*radius"
            :rx="graph.is_boundary_r(r) ? 0 : radius"
            @pointerover="hover('r'+r)" 
           :transform="\`translate($\{graph.pos_of_r(r)})\`"/>
    </g>
`,
});

Vue.component('a-region-labels', {
    props: ['graph'],
    template: `
    <g class="region-labels">
      <a-label v-for="(_,r) in graph.numSolidRegions" :key="r"
        class="r" 
        :dy="graph.y_of_r(r) > 150? 25 : -15" :at="graph.pos_of_r(r)">
        r{{r}}
      </a-label>
    </g>
`,
});

Vue.component('a-triangle-points', {
    props: ['graph', 'hover', 'radius'],
    template: `
      <g class="triangle-points">
        <circle v-for="(_,t) in graph.numTriangles" :key="t"
          :class="'t' + (graph.is_ghost_t(t)? ' ghost':'')" 
          :r="radius || 7"
          @pointerover="hover('t'+t)" 
          :transform="\`translate($\{graph.pos_of_t(t)})\`"/>
      </g>
`,
});

Vue.component('a-triangle-labels', {
    props: ['graph'],
    template: `
      <g class="triangle-labels">
        <a-label v-for="(_,t) in graph.numTriangles" :key="t"
          class="t" :class="{ghost: graph.is_ghost_t(t)}"
          dy="25" 
          :at="graph.pos_of_t(t)">
          t{{t}}
        </a-label>
      </g>
`,
});

function makeDiagram(el, graph) {
    new Vue({
        el,
        data: {
            graph: Object.freeze(graph),
            highlight: '',
            showGhosts: el.classList.contains('show-ghosts'), // NOTE: there's also a show-ghosts class separately controlled :(
        },
        methods: {
            hover: function(label) {
                this.highlight = label;
            },
            test(accessor, id) {
                let result = this.graph[accessor](id);
                if (typeof result === 'number') {
                    return accessor[0] + result;
                } else {
                    // assume it's an array of numbers; need to filter out ghosts
                    let output = [];
                    for (let id of result) {
                        let s = accessor[0] + id;
                        if (this.graph['is_ghost_' + accessor[0]](id)) { // it's a ghost
                            if (this.showGhosts) output.push(s + "👻");
                        } else {
                            output.push(s);
                        }
                    }
                    return output.join(", ");
                }
            },
        }
    });
}

function makeDiagrams(name, mesh) {
    for (let diagram of document.querySelectorAll(".diagram-" + name)) {
        makeDiagram(diagram, mesh);
    }
}

makeDiagrams("g0", G0);
makeDiagrams("g1", G1);
makeDiagrams("g2", G2);
makeDiagrams("g3", G3);
makeDiagrams("g4", G4);
