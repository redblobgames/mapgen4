// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

/* global makeRandFloat, makeRandInt */

const data = {
    t0: [150, 150],
    t1: [450, 120],
    r0: [300, 50],
    r1: [350, 250],
    division: 0.5,
    divisionSpan: 0.5,
    levels: 2,
    seed: 1,
};

function mixp(p, q, t) {
    return [
        p[0] * (1-t) + q[0] * t,
        p[1] * (1-t) + q[1] * t
    ];
}

Vue.component('a-quad', {
    props: ['a', 'b', 'p', 'q'],
    template: '<path class="b" :d="\`M ${a} L ${p} L ${b} L ${q} Z\`" />',
});

Vue.component('a-circle', {
    props: ['at'],
    template: '<circle :cx="at[0]" :cy="at[1]" r="10"/>',
});

Vue.component('a-base', {
    props: ['data'],
    template: `
      <g>
        <a-quad :a="data.t0" :b="data.t1" :p="data.r0" :q="data.r1"/>
        <a-circle class="r" :at="data.r0"/>
        <a-circle class="r" :at="data.r1"/>
        <a-circle class="t" :at="data.t0"/>
        <a-circle class="t" :at="data.t1"/>
     </g>
`,
});

function recursiveSubdivision(level, {a, b, p, q}, randFloat) {
    if (level <= 0) {
        return {
            line: [a, b],
            quads: [{level, a, b, p, q}],
        };
    }
    
    let ap = mixp(a, p, 0.5),
        bp = mixp(b, p, 0.5),
        aq = mixp(a, q, 0.5),
        bq = mixp(b, q, 0.5);
    let division = 0.5 * (1 - data.divisionSpan) + randFloat() * data.divisionSpan;
    let center = mixp(p, q, division);
    
    let quad1 = {level, a: a, b: center, p: ap, q: aq},
        quad2 = {level, a: center, b: b, p: bp, q: bq};
    
    let results1 = recursiveSubdivision(level-1, quad1, randFloat),
        results2 = recursiveSubdivision(level-1, quad2, randFloat);

    return {
        line: results1.line.concat(results2.line.slice(1)),
        quads: results1.quads.concat([{level, a, b, p, q}].concat(results2.quads)),
    };
}

let page = new Vue({
    el: "#vue-container",
    data: data,
    computed: {
        center: function() { return mixp(this.r0, this.r1, this.division); },
        recursive: function() { return recursiveSubdivision(this.levels, {a: this.t0, b: this.t1, p: this.r0, q: this.r1}, makeRandFloat(this.seed)); },
        quads: function() { return this.recursive.quads; },
        path: function() { return "M" + this.recursive.line.join("L"); },
        m00: function() { return mixp(this.t0, this.r0, 0.5); },
        m01: function() { return mixp(this.t0, this.r1, 0.5); },
        m10: function() { return mixp(this.t1, this.r0, 0.5); },
        m11: function() { return mixp(this.t1, this.r1, 0.5); },
    },
    methods: {
        // NOTE: the random number generator I'm using produces reasonable sequences
        // but related seeds produce related sequences, so it's not safe to just
        // increment the seed by 1. I instead pick a random seed each time:
        nextSeed: function() { this.seed = makeRandInt(this.seed)(0x7fffffff); },
    },
});


// Sliders don't work well on iOS so I want to make the tap area larger
document.querySelectorAll("input[type='range']").forEach((slider) => {
    function handleTouch(e) {
        let rect = slider.getBoundingClientRect();
        let min = parseFloat(slider.getAttribute('min')),
            max = parseFloat(slider.getAttribute('max')),
            step = parseFloat(slider.getAttribute('step')) || 1;
        let value = (e.changedTouches[0].clientX - rect.left) / rect.width;
        value = min + value * (max - min);
        value = Math.round(value / step) * step;
        if (value < min) { value = min; }
        if (value > max) { value = max; }
        slider.value = value;
        slider.dispatchEvent(new Event('input'));
        e.preventDefault();
        e.stopPropagation();
    };
    slider.addEventListener('touchmove', handleTouch);
    slider.addEventListener('touchstart', handleTouch);
});
