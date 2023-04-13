/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

import Vue from "/mjs/vue.v2.browser.min.js";
import Poisson from "./build/_poisson-disk-sampling.js";
import MeshBuilder from "./build/_meshbuilder.js";

const seeds1 = [
    [250, 30], [100, 260], [400, 260], [550, 30]
];

const seeds2 = [
    [320, 170], [220, 270], [400, 270],
    [530, 50], [100, 80], [300, 30],
    [50, 220], [550, 240],
];


let G0 = new MeshBuilder({bounds: {left: 0, top: 0, width: 1000, height: 1000}, boundarySpacing: 75})
    .replacePointsFn((points) => {
        let generator = new Poisson({
            shape: [1000, 1000],
            minDistance: 75,
        });
        for (let p of points) generator.addPoint(p);
        return generator.fill();
    })
    .create();
let G1 = new MeshBuilder()
    .appendPoints(seeds1)
    .create();
let G2 = new MeshBuilder({bounds: {left: -50, top: -25, width: 700, height: 350}})
    .appendPoints(seeds2)
    .create();

// New boundary point generator function with convex curve and no
// duplicates and support for non-square
let G6 = new MeshBuilder({bounds: {left: 0, top: 0, width: 1000, height: 1000}, boundarySpacing: 75})
    .replacePointsFn((points) => {
        let generator = new Poisson({
            shape: [1000, 1000],
            minDistance: 75 * 2/3,
        });
        for (let p of points) generator.addPoint(p);
        return generator.fill();
    })
    .create();

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
 * return point on rectangle closest to the given point
 *
 * @param {[number, number]} p - point to extrapolate
 * @param {[number, number]} center
 * @param {[number, number]} dimensions - width, height
 * @returns {[number, number]}
 */
function extrapolate_from_center(p, center, dimensions) {
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
         <a-label class="r" :at="labelPositionForSynthetic(pos)">r8</a-label>
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
            const INFLATE_BOUNDARY = 1.0;
            // move ghost elements to the bounding region
            const bounds = this.graph._options.bounds ?? {left: 0, top: 0, width: 1000, height: 1000};
            const boundsDimensions = [bounds.width * INFLATE_BOUNDARY, bounds.height * INFLATE_BOUNDARY];
            const boundsCenter = [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
            let p1 = this.graph.pos_of_r(this.graph.r_end_s(s));
            let p2 = this.graph.pos_of_r(this.graph.r_end_s(this.graph.s_next_s(s)));
            return extrapolate_from_center(interpolate(p1, p2, 0.5), boundsCenter, boundsDimensions);
        },            
        b_side(s) {
            const alpha = this.alpha ?? 0.0;
            let begin = this.graph.pos_of_r(this.graph.r_begin_s(s));
            let end = this.graph.pos_of_r(this.graph.r_end_s(s));
            let center = this.graph.pos_of_t(this.graph.t_inner_s(s));
            begin = interpolate(begin, center, alpha);
            end = interpolate(end, center, alpha);
            if (this.graph.is_ghost_r(this.graph.r_begin_s(s))) {
                begin = this.synthetic_region_location(s);
            } else if (this.graph.is_ghost_r(this.graph.r_end_s(s))) {
                end = this.synthetic_region_location(this.graph.s_next_s(s));
            }
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
      <a-label v-for="(_,s) in graph.numSolidSides" :key="s"
        class="s" 
        dy="7"
        :at="interpolate(graph.pos_of_r(graph.r_begin_s(s)),
                         graph.pos_of_t(graph.t_inner_s(s)),
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
        <a-label v-for="(_,t) in graph.numSolidTriangles" :key="t"
          class="t" 
          dy="25" 
          :at="graph.pos_of_t(t)">
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

function makeDiagrams(name, mesh) {
    for (let diagram of document.querySelectorAll(".diagram-" + name)) {
        makeDiagram(diagram, mesh);
    }
}

makeDiagrams("g0", G0);
makeDiagrams("g1", G1);
makeDiagrams("g2", G2);
makeDiagrams("g6", G6);
