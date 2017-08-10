// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

/* global makeRandFloat */

'use strict';

const SEED = 123456789;
const TriangleMesh = require('@redblobgames/triangle-mesh');
const createMesh =   require('@redblobgames/triangle-mesh/create');
const SimplexNoise = require('simplex-noise');
const Water =        require('./algorithms/water');
const Elevation =    require('./algorithms/elevation');
const Rivers =       require('./algorithms/rivers');
const Moisture =     require('./algorithms/moisture');
const Biomes =       require('./algorithms/biomes');
const {mix, clamp, smoothstep, circumcenter} = require('./algorithms/util');

let noise = new SimplexNoise(makeRandFloat(SEED));
const mesh_10 = new TriangleMesh(createMesh(10.0, makeRandFloat(SEED)));
const mesh_15 = new TriangleMesh(createMesh(15.0, makeRandFloat(SEED)));
const mesh_30 = new TriangleMesh(createMesh(30.0, makeRandFloat(SEED)));
const mesh_50 = new TriangleMesh(createMesh(50.0, makeRandFloat(SEED)));
const mesh_75 = new TriangleMesh(createMesh(75.0, makeRandFloat(SEED)));


function drawArrow(ctx, p, q) {
    const stemLength = 0.5;
    const headLength = 0.5;
    const stemWidth = 0.15;
    const headWidth = 0.4;
    const tailLength = 0.1;
    
    let s = [mix(p[0], q[0], 0.2), mix(p[1], q[1], 0.2)];
    let dx = (q[0] - p[0]) * 0.7;
    let dy = (q[1] - p[1]) * 0.7;

    ctx.beginPath();
    ctx.moveTo(s[0] + dx*tailLength, s[1] + dy*tailLength);
    ctx.lineTo(s[0] - dy*stemWidth, s[1] + dx*stemWidth);
    ctx.lineTo(s[0] + dx*stemLength - dy*stemWidth, s[1] + dy*stemLength + dx*stemWidth);
    ctx.lineTo(s[0] + dx*(1-headLength) - dy*headWidth, s[1] + dy*(1-headLength) + dx*headWidth);
    ctx.lineTo(s[0] + dx, s[1] + dy);
    ctx.lineTo(s[0] + dx*(1-headLength) + dy*headWidth, s[1] + dy*(1-headLength) - dx*headWidth);
    ctx.lineTo(s[0] + dx*stemLength + dy*stemWidth, s[1] + dy*stemLength - dx*stemWidth);
    ctx.lineTo(s[0] + dy*stemWidth, s[1] - dx*stemWidth);
    ctx.lineTo(s[0] + dx*tailLength, s[1] + dy*tailLength);
    ctx.fill();
}


function fallback(value, orElse) {
    return (value !== undefined)? value : orElse;
}

function setCanvasStyle(ctx, style, defaults) {
    ctx.globalAlpha = fallback(style.globalAlpha, fallback(defaults.globalAlpha, 1.0));
    ctx.lineWidth =   fallback(style.lineWidth,   fallback(defaults.lineWidth,   1.0));
    ctx.fillStyle =   fallback(style.fillStyle,   fallback(defaults.fillStyle,   "black"));
    ctx.strokeStyle = fallback(style.strokeStyle, fallback(defaults.strokeStyle, "black"));
}

let layers = {};

layers.triangleEdges = (style) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {strokeStyle: "black", lineWidth: 1.0});
    for (let e = 0; e < mesh.numSolidEdges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        ctx.beginPath();
        ctx.moveTo(mesh.vertices[v0][0], mesh.vertices[v0][1]);
        ctx.lineTo(mesh.vertices[v1][0], mesh.vertices[v1][1]);
        ctx.stroke();
    }
};

layers.polygonEdges = (style) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {strokeStyle: "white", lineWidth: 1.5});
    for (let e = 0; e < mesh.numEdges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        let t0 = TriangleMesh.e_to_t(e);
        let t1 = TriangleMesh.e_to_t(mesh.opposites[e]);
        if (t0 > t1) {
            ctx.beginPath();
            ctx.moveTo(mesh.centers[t0][0], mesh.centers[t0][1]);
            ctx.lineTo(mesh.centers[t1][0], mesh.centers[t1][1]);
            ctx.stroke();
        }
    }
};

layers.polygonEdgesColored = (style, coloring) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {lineWidth: 2.0});
    for (let e = 0; e < mesh.numEdges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        let t0 = TriangleMesh.e_to_t(e);
        let t1 = TriangleMesh.e_to_t(mesh.opposites[e]);
        if (t0 > t1) {
            let color = coloring(e, v0, v1, t0, t1);
            if (color) {
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(mesh.centers[t0][0], mesh.centers[t0][1]);
                ctx.lineTo(mesh.centers[t1][0], mesh.centers[t1][1]);
                ctx.stroke();
            }
        }
    }
};

layers.triangleCenters = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    setCanvasStyle(ctx, style, {fillStyle: "hsl(240,50%,50%)", strokeStyle: "white", lineWidth: 1.0});
    for (let t = 0; t < mesh.numSolidTriangles; t++) {
        ctx.beginPath();
        ctx.arc(mesh.centers[t][0], mesh.centers[t][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

layers.triangleCentersColored = (style, coloring) => (ctx, mesh) => {
    const radius = style.radius || 5;
    setCanvasStyle(ctx, style, {});
    for (let t = 0; t < mesh.numSolidTriangles; t++) {
        let color = coloring(t);
        if (color) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(mesh.centers[t][0], mesh.centers[t][1], radius, 0, 2*Math.PI);
            ctx.stroke();
            ctx.fill();
        }
    }
};

layers.polygonCenters = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    setCanvasStyle(ctx, style, {fillStyle: "hsl(0,50%,50%)", strokeStyle: "hsl(0,0%,75%)", lineWidth: 3.0});
    for (let v = 0; v < mesh.numSolidVertices; v++) {
        ctx.beginPath();
        ctx.arc(mesh.vertices[v][0], mesh.vertices[v][1], mesh.v_boundary(v) ? radius/2 : radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

/* coloring should be a function from v (polygon) to color string */
layers.polygonColors = (style, coloring) => (ctx, mesh) => {
    const radius = style.radius || 5;
    let out_t = [];
    setCanvasStyle(ctx, style, {});
    for (let v = 0; v < mesh.numSolidVertices; v++) {
        mesh.v_circulate_t(out_t, v);
        ctx.fillStyle = coloring(v);
        ctx.beginPath();
        ctx.moveTo(mesh.centers[out_t[0]][0], mesh.centers[out_t[0]][1]);
        for (let i = 1; i < out_t.length; i++) {
            ctx.lineTo(mesh.centers[out_t[i]][0], mesh.centers[out_t[i]][1]);
        }
        ctx.fill();
    }
};

layers.drawRivers = (style, e_flow) => (ctx, mesh) => {
    setCanvasStyle(ctx, {}, {lineWidth: 2.5, strokeStyle: "hsl(240,50%,50%)"});
    let baseLineWidth = ctx.lineWidth;
    for (let e = 0; e < mesh.numEdges; e++) {
        if (e_flow[e] > 0) {
            ctx.lineWidth = baseLineWidth * Math.sqrt(e_flow[e]);
            let v0 = mesh.e_begin_v(e);
            let v1 = mesh.e_end_v(e);
            let t0 = TriangleMesh.e_to_t(e);
            let t1 = TriangleMesh.e_to_t(mesh.opposites[e]);
            ctx.beginPath();
            ctx.moveTo(mesh.centers[t0][0], mesh.centers[t0][1]);
            ctx.lineTo(mesh.centers[t1][0], mesh.centers[t1][1]);
            ctx.stroke();
        }
    }
};

layers.drawSprings = (style, river_t) => (ctx, mesh) => {
    setCanvasStyle(ctx, {}, {lineWidth: 1.0, fillStyle: "white", strokeStyle: "hsl(240,50%,50%)"});
    for (let t of river_t) {
        ctx.beginPath();
        ctx.arc(mesh.centers[t][0], mesh.centers[t][1], 3, 0, 2*Math.PI);
        ctx.fill();
        ctx.stroke();
    }
};
            

function diagram(canvas, mesh, options, layers) {
    const scale = fallback(options.scale, 1.0);
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width/1000, canvas.height/1000);
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.translate(500, 500); ctx.scale(scale, scale); ctx.translate(-500, -500);
    ctx.fillStyle = "hsl(60, 5%, 75%)";
    ctx.fillRect(0, 0, 1000, 1000);

    for (let layer of layers) {
        layer(ctx, mesh);
    }
    
    ctx.restore();
}

function createCircumcenterMesh(mesh, mixture) {
    let centers = [], out_v = [];
    for (var t = 0; t < mesh.numSolidTriangles; t++) {
        mesh.t_circulate_v(out_v, t);
        let a = mesh.vertices[out_v[0]],
            b = mesh.vertices[out_v[1]],
            c = mesh.vertices[out_v[2]];
        let center = circumcenter(a, b, c);
        centers.push([mix(mesh.centers[t][0], center[0], mixture),
                      mix(mesh.centers[t][1], center[1], mixture)]);
    }
    for (; t < mesh.numTriangles; t++) {
        centers.push(mesh.centers[t]);
    }
    let newMesh = new TriangleMesh(mesh);
    newMesh.centers = centers;
    return newMesh;
}


let diagramMeshConstruction = new Vue({
    el: "#diagram-mesh-construction",
    data: {
        time: 0.0,
        timeGoal: 0.0,
        centroidCircumcenterMix: 0.0,
        mesh: Object.freeze(mesh_75)
    },
    directives: {
        draw: function(canvas, {value: {mesh, time, centroidCircumcenterMix}}) {
            diagram(canvas,
                    createCircumcenterMesh(mesh, centroidCircumcenterMix),
                    {scale: 0.9},
                    [
                        layers.triangleEdges({globalAlpha: smoothstep(0.1, 1.0, time) - 0.75 * smoothstep(1.1, 3.0, time), lineWidth: 3.0}),
                        layers.polygonEdges({globalAlpha: smoothstep(2.1, 3.0, time), strokeStyle: "hsl(0,0%,90%)", lineWidth: 4.0}),
                        layers.polygonCenters({radius: 7}),
                        layers.triangleCenters({globalAlpha: smoothstep(1.1, 2.0, time)})
                    ]);
        }
    }
});

setInterval(() => {
    const speed = 1.0;
    const dt = 20/1000;
    let step = clamp(speed * (diagramMeshConstruction.timeGoal - diagramMeshConstruction.time), -dt, +dt);
    diagramMeshConstruction.time += step;
}, 20);


new Vue({
    el: "#diagram-water-assignment",
    data: {
        round: 0.5,
        inflate: 0.5,
        showLakes: false,
        showCoast: false,
        mesh: Object.freeze(mesh_30)
    },
    computed: {
        v_water: function() {
            return Water.assign_v_water(this.mesh, noise,
                                        {round: this.round, inflate: this.inflate});
        },
        v_ocean: function() { return Water.assign_v_ocean(this.mesh, this.v_water); },
        counts: function() {
            let ocean = 0, lake = 0;
            for (let v = 0; v < this.mesh.numVertices; v++) {
                if (this.v_water[v]) {
                    if (this.v_ocean[v]) { ocean++; }
                    else                 { lake++; }
                }
            }
            return {ocean, lake};
        }
    },
    directives: {
        draw: function(canvas, {value: {mesh, v_water, v_ocean, showLakes, showCoast}}) {
            if (showCoast) { showLakes = true; }
            if (!showLakes) { v_ocean = v_water; }
            diagram(canvas, mesh, {}, [
                layers.polygonColors({}, (v) => v_ocean[v]? "hsl(230,30%,30%)" : v_water[v]? "hsl(200,30%,50%)" : "hsl(30,15%,60%)"),
                layers.polygonEdges({strokeStyle: "black"}),
                layers.polygonEdgesColored({lineWidth: 4.0, globalAlpha: showCoast? 1.0 : 0.0}, (_, v0, v1, t0, t1) => v_ocean[v0] !== v_ocean[v1]? "white" : null),
                layers.polygonCenters({radius: 1.5, fillStyle: "black", strokeStyle: "black"})
            ]);
        }
    }
});


new Vue({
    el: "#diagram-elevation-assignment",
    data: {
        mesh: Object.freeze(mesh_30),
        show: null
    },
    computed: {
        v_water: function() { return Water.assign_v_water(this.mesh, noise, {round: 0.5, inflate: 0.5}); },
        v_ocean: function() { return Water.assign_v_ocean(this.mesh, this.v_water); },
        t_elevation: function() { return Elevation.assign_t_elevation(this.mesh, this.v_ocean, this.v_water); },
        v_elevation: function() { return Elevation.assign_v_elevation(this.mesh, this.t_elevation, this.v_ocean); }
    },
    directives: {
        draw: function(canvas, {value: {show, mesh, v_water, v_ocean, t_elevation, v_elevation}}) {
            let coasts_t = Elevation.find_coasts_t(mesh, v_ocean);
            function polygonColoring(v) {
                if (v_ocean[v]) {
                    return `hsl(240,25%,${50+30*v_elevation[v]}%)`;
                } else {
                    return `hsl(105,${25-10*v_elevation[v]}%,${50+50*v_elevation[v]}%)`;
                }
            }
            let config = null;
            switch (show) {
            case 'coast_t': config = [
                layers.polygonColors({}, (v) => v_ocean[v]? "hsl(230,30%,30%)" : "hsl(30,15%,60%)"),
                layers.polygonEdgesColored({lineWidth: 1.5}, (_, v0, v1, t0, t1) => v_ocean[v0] !== v_ocean[v1]? "white" : null),
                layers.triangleCentersColored({radius: 5}, (t) => coasts_t.indexOf(t) >= 0? "white" : null)
            ];
                break;
            case 'v_elevation': config = [
                layers.polygonColors({}, (v) => v_ocean[v]? "hsl(230,30%,30%)" : "hsl(30,15%,60%)"),
                layers.polygonEdges({strokeStyle: "black", lineWidth: 1.0}),
                layers.triangleCentersColored({radius: 5}, (t) =>
                                                t_elevation[t] == 0? "white"
                                                : t_elevation[t] < 0? `hsl(240,25%,${100+100*t_elevation[t]}%)`
                                                : `hsl(60,25%,${100-100*t_elevation[t]}%)`)
            ];
                break;
            default: config = [
                layers.polygonColors({}, polygonColoring),
                layers.polygonEdges({strokeStyle: "black", lineWidth: 1.0}),
                layers.polygonCenters({radius: 0.5, fillStyle: "black", strokeStyle: "black"})
            ];
            }
            diagram(canvas, mesh, {}, config);
        }
    }
});


new Vue({
    el: "#diagram-drainage-assignment",
    data: {
        mesh: Object.freeze(mesh_30),
        show: null,
        river_t: []
    },
    computed: {
        v_water:       function() { return Water.assign_v_water(this.mesh, noise, {round: 0.5, inflate: 0.5}); },
        v_ocean:       function() { return Water.assign_v_ocean(this.mesh, this.v_water); },
        t_elevation:   function() { return Elevation.assign_t_elevation(this.mesh, this.v_ocean, this.v_water); },
        v_elevation:   function() { return Elevation.assign_v_elevation(this.mesh, this.t_elevation, this.v_ocean); },
        t_downslope_e: function() { return Rivers.assign_t_downslope_e(this.mesh, this.t_elevation); },
        e_flow:        function() { return Rivers.assign_e_flow(this.mesh, this.t_downslope_e, this.river_t, this.t_elevation); }
    },
    methods: {
        addRiver:      function() { this.river_t.push(Rivers.next_river_t(this.mesh, this.river_t, this.t_elevation)); },
        addRiver25:    function() { for (let i = 0; i < 25; i++) { this.addRiver(); } },
        reset:         function() { this.river_t = []; }
    },
    directives: {
        draw: function(canvas, {value: {show, mesh, v_water, v_ocean, v_elevation, t_downslope_e, river_t, e_flow}}) {
            function polygonColoring(v) {
                if (v_ocean[v]) {
                    return `hsl(240,25%,${50+30*v_elevation[v]}%)`;
                } else {
                    return `hsl(105,${25-10*v_elevation[v]}%,${50+50*v_elevation[v]}%)`;
                }
            }
            
            function drawDrainage(ctx, mesh) {
                const alpha = 1.0;
                ctx.lineWidth = 4.0;
                for (let t1 = 0; t1 < mesh.numSolidTriangles; t1++) {
                    let e = t_downslope_e[t1];
                    ctx.fillStyle = v_ocean[mesh.e_begin_v(e)] ? "black" : "hsl(240,50%,50%)";
                    let t2 = e === -1? t1 : TriangleMesh.e_to_t(mesh.opposites[e]);
                    ctx.beginPath();
                    if (t1 !== t2) {
                        drawArrow(ctx, mesh.centers[t1], mesh.centers[t2]);
                    }
                }
            }
            
            let config = null;
            diagram(canvas, mesh, {}, [
                layers.polygonColors({}, polygonColoring),
                river_t.length > 0? layers.drawRivers({}, e_flow) : drawDrainage,
                layers.drawSprings({}, river_t),
                layers.polygonEdgesColored({lineWidth: 1.5}, (_, v0, v1, t0, t1) => v_ocean[v0] !== v_ocean[v1]? "white" : null),
            ]);
        }
    }
});


new Vue({
    el: "#diagram-moisture-assignment",
    data: {
        mesh: Object.freeze(mesh_15),
        show: null,
        river_t: []
    },
    computed: {
        v_water:       function() { return Water.assign_v_water(this.mesh, noise, {round: 0.5, inflate: 0.5}); },
        v_ocean:       function() { return Water.assign_v_ocean(this.mesh, this.v_water); },
        t_elevation:   function() { return Elevation.assign_t_elevation(this.mesh, this.v_ocean, this.v_water); },
        v_elevation:   function() { return Elevation.assign_v_elevation(this.mesh, this.t_elevation, this.v_ocean); },
        t_downslope_e: function() { return Rivers.assign_t_downslope_e(this.mesh, this.t_elevation); },
        e_flow:        function() { return Rivers.assign_e_flow(this.mesh, this.t_downslope_e, this.river_t, this.t_elevation); },
        v_moisture:    function() { return Moisture.assign_v_moisture(this.mesh, this.v_ocean, this.v_water, Moisture.find_riverbanks_v(this.mesh, this.e_flow)); }
    },
    methods: {
        addRiver:      function() { this.river_t.push(Rivers.next_river_t(this.mesh, this.river_t, this.t_elevation)); },
        addRiver10:    function() { for (let i = 0; i < 10; i++) { this.addRiver(); } },
        reset:         function() { this.river_t = []; }
    },
    directives: {
        draw: function(canvas, {value: {show, mesh, v_water, v_ocean, v_moisture, t_downslope_e, river_t, e_flow}}) {
            function polygonColoring(v) {
                if (v_ocean[v]) {
                    return `hsl(240,25%,25%)`;
                } else {
                    return `hsl(${30+120*v_moisture[v]},15%,${75-25*v_moisture[v]}%)`;
                }
            }
            
            let config = null;
            diagram(canvas, mesh, {}, [
                layers.polygonColors({}, polygonColoring),
                layers.drawRivers({}, e_flow),
                layers.drawSprings({}, river_t),
                layers.polygonEdgesColored({lineWidth: 1.5}, (_, v0, v1, t0, t1) => v_ocean[v0] !== v_ocean[v1]? "white" : null),
            ]);
        }
    }
}).addRiver();


new Vue({
    el: "#diagram-biome-assignment",
    data: {
        mesh: Object.freeze(mesh_10),
        show: null,
        river_t: []
    },
    computed: {
        v_water:       function() { return Water.assign_v_water(this.mesh, noise, {round: 0.5, inflate: 0.5}); },
        v_ocean:       function() { return Water.assign_v_ocean(this.mesh, this.v_water); },
        t_elevation:   function() { return Elevation.assign_t_elevation(this.mesh, this.v_ocean, this.v_water); },
        v_elevation:   function() { return Elevation.assign_v_elevation(this.mesh, this.t_elevation, this.v_ocean); },
        t_downslope_e: function() { return Rivers.assign_t_downslope_e(this.mesh, this.t_elevation); },
        e_flow:        function() { return Rivers.assign_e_flow(this.mesh, this.t_downslope_e, this.river_t, this.t_elevation); },
        v_moisture:    function() { return Moisture.assign_v_moisture(this.mesh, this.v_ocean, this.v_water, Moisture.find_riverbanks_v(this.mesh, this.e_flow)); },
        v_biome:       function() { return Biomes.assign_v_biome(this.mesh, this.v_ocean, this.v_water, this.v_elevation, this.v_moisture); }
    },
    methods: {
        addRiver:      function() { this.river_t.push(Rivers.next_river_t(this.mesh, this.river_t, this.t_elevation)); },
        addRiver10:    function() { for (let i = 0; i < 10; i++) { this.addRiver(); } },
        reset:         function() { this.river_t = []; }
    },
    directives: {
        draw: function(canvas, {value: {show, mesh, river_t, e_flow, v_biome}}) {
            const biomeColors = {
                OCEAN: "#44447a",
                COAST: "#33335a",
                LAKESHORE: "#225588",
                LAKE: "#336699",
                RIVER: "#225588",
                MARSH: "#2f6666",
                ICE: "#99ffff",
                BEACH: "#a09077",
                SNOW: "#ffffff",
                TUNDRA: "#bbbbaa",
                BARE: "#888888",
                SCORCHED: "#555555",
                TAIGA: "#99aa77",
                SHRUBLAND: "#889977",
                TEMPERATE_DESERT: "#c9d29b",
                TEMPERATE_RAIN_FOREST: "#448855",
                TEMPERATE_DECIDUOUS_FOREST: "#679459",
                GRASSLAND: "#88aa55",
                SUBTROPICAL_DESERT: "#d2b98b",
                TROPICAL_RAIN_FOREST: "#337755",
                TROPICAL_SEASONAL_FOREST: "#559944"
            };
                
            function polygonColoring(v) {
                return biomeColors[v_biome[v] || "red"];
            }
            
            let config = null;
            diagram(canvas, mesh, {}, [
                layers.polygonColors({}, polygonColoring),
                layers.polygonEdgesColored({lineWidth: 0.5}, (_, v0, v1, t0, t1) => v_biome[v0] !== v_biome[v1]? "black" : null),
                layers.drawRivers({lineWidth: 0.5}, e_flow),
            ]);
        }
    }
}).addRiver10();
