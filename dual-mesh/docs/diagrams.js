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
