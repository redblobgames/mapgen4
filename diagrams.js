// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

/* global makeRandFloat, makeRandInt */

'use strict';

const SEED = 123456788;
const DualMesh =     require('@redblobgames/dual-mesh');
const createMesh =   require('@redblobgames/dual-mesh/create');
const SimplexNoise = require('simplex-noise');
const util =         require('./algorithms/util');
const Water =        require('./algorithms/water');
const Elevation =    require('./algorithms/elevation');
const Rivers =       require('./algorithms/rivers');
const Moisture =     require('./algorithms/moisture');
const Biomes =       require('./algorithms/biomes');
const NoisyEdges =   require('./algorithms/noisy-edges');

let noise = new SimplexNoise(makeRandFloat(SEED));
const mesh_10 = new DualMesh(createMesh(10.0, makeRandFloat(SEED)));
const mesh_15 = new DualMesh(createMesh(15.0, makeRandFloat(SEED)));
const mesh_30 = new DualMesh(createMesh(30.0, makeRandFloat(SEED)));
const mesh_50 = new DualMesh(createMesh(50.0, makeRandFloat(SEED)));
const mesh_75 = new DualMesh(createMesh(75.0, makeRandFloat(SEED)));

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
    TROPICAL_SEASONAL_FOREST: "#559944",
};

function drawArrow(ctx, tail, head) {
    const stemLength = 0.5;
    const headLength = 0.5;
    const stemWidth = 0.15;
    const headWidth = 0.4;
    const tailLength = 0.1;
    
    let sx = util.mix(tail[0], head[0], 0.2);
    let sy = util.mix(tail[1], head[1], 0.2);
    let dx = (head[0] - tail[0]) * 0.7;
    let dy = (head[1] - tail[1]) * 0.7;

    ctx.beginPath();
    ctx.moveTo(sx + dx*tailLength, sy + dy*tailLength);
    ctx.lineTo(sx - dy*stemWidth, sy + dx*stemWidth);
    ctx.lineTo(sx + dx*stemLength - dy*stemWidth, sy + dy*stemLength + dx*stemWidth);
    ctx.lineTo(sx + dx*(1-headLength) - dy*headWidth, sy + dy*(1-headLength) + dx*headWidth);
    ctx.lineTo(sx + dx, sy + dy);
    ctx.lineTo(sx + dx*(1-headLength) + dy*headWidth, sy + dy*(1-headLength) - dx*headWidth);
    ctx.lineTo(sx + dx*stemLength + dy*stemWidth, sy + dy*stemLength - dx*stemWidth);
    ctx.lineTo(sx + dy*stemWidth, sy - dx*stemWidth);
    ctx.lineTo(sx + dx*tailLength, sy + dy*tailLength);
    ctx.fill();
}


function setCanvasStyle(ctx, style, defaults) {
    const globalCanvasStyle = {
        globalAlpha: 1.0,
        lineWidth: 1.0,
        lineJoin: 'miter',
        fillStyle: "black",
        strokeStyle: "black"
    };
    Object.assign(ctx, globalCanvasStyle);
    Object.assign(ctx, defaults);
    Object.assign(ctx, style);
}

let layers = {};

layers.triangleSides = (style) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {strokeStyle: "black", lineWidth: 1.0});
    for (let s = 0; s < mesh.numSolidSides; s++) {
        let r0 = mesh.s_begin_r(s);
        let r1 = mesh.s_end_r(s);
        ctx.beginPath();
        ctx.moveTo(mesh.r_vertex[r0][0], mesh.r_vertex[r0][1]);
        ctx.lineTo(mesh.r_vertex[r1][0], mesh.r_vertex[r1][1]);
        ctx.stroke();
    }
};

layers.triangleSidesColored = (style, coloring) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {strokeStyle: "black", lineWidth: 1.0});
    for (let s = 0; s < mesh.numSolidSides; s++) {
        let r0 = mesh.s_begin_r(s);
        let r1 = mesh.s_end_r(s);
        let color = coloring(s, r0, r1);
        if (color) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(mesh.r_vertex[r0][0], mesh.r_vertex[r0][1]);
            ctx.lineTo(mesh.r_vertex[r1][0], mesh.r_vertex[r1][1]);
            ctx.stroke();
        }
    }
};

layers.regionSides = (style) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {strokeStyle: "white", lineWidth: 1.5});
    for (let s = 0; s < mesh.numSides; s++) {
        let r0 = mesh.s_begin_r(s);
        let r1 = mesh.s_end_r(s);
        let t0 = mesh.s_inner_t(s);
        let t1 = mesh.s_outer_t(s);
        if (t0 > t1) {
            ctx.beginPath();
            ctx.moveTo(mesh.t_vertex[t0][0], mesh.t_vertex[t0][1]);
            ctx.lineTo(mesh.t_vertex[t1][0], mesh.t_vertex[t1][1]);
            ctx.stroke();
        }
    }
};

layers.regionSidesColored = (style, coloring) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {lineWidth: 2.0});
    for (let s = 0; s < mesh.numSides; s++) {
        let r0 = mesh.s_begin_r(s);
        let r1 = mesh.s_end_r(s);
        let t0 = mesh.s_inner_t(s);
        let t1 = mesh.s_outer_t(s);
        if (t0 > t1) {
            let color = coloring(s, r0, r1, t0, t1);
            if (color) {
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(mesh.t_vertex[t0][0], mesh.t_vertex[t0][1]);
                ctx.lineTo(mesh.t_vertex[t1][0], mesh.t_vertex[t1][1]);
                ctx.stroke();
            }
        }
    }
};

layers.triangleCenters = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    setCanvasStyle(ctx, style, {fillStyle: "hsl(230,50%,50%)", strokeStyle: "white", lineWidth: 1.0});
    for (let t = 0; t < mesh.numSolidTriangles; t++) {
        ctx.beginPath();
        ctx.arc(mesh.t_vertex[t][0], mesh.t_vertex[t][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

layers.triangleCentersLabeled = (style, labeling) => (ctx, mesh) => {
    const fontheight = 18;
    setCanvasStyle(ctx, style, {fillStyle: "black"});
    ctx.font = `${fontheight}px sans-serif`;
    ctx.textAlign = "center";
    for (let t = 0; t < mesh.numSolidTriangles; t++) {
        let label = labeling(t);
        if (label) {
            ctx.fillText(label, mesh.t_vertex[t][0], mesh.t_vertex[t][1] + fontheight*0.4);
        }
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
            ctx.arc(mesh.t_vertex[t][0], mesh.t_vertex[t][1], radius, 0, 2*Math.PI);
            ctx.stroke();
            ctx.fill();
        }
    }
};

layers.regionCenters = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    setCanvasStyle(ctx, style, {fillStyle: "hsl(0,50%,50%)", strokeStyle: "hsl(0,0%,75%)", lineWidth: 3.0});
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        ctx.beginPath();
        ctx.arc(mesh.r_vertex[r][0], mesh.r_vertex[r][1], mesh.r_boundary(r) ? radius/2 : radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

layers.quadrilateralSides = (style) => (ctx, mesh) => {
    let t_out = [];
    setCanvasStyle(ctx, style, {strokeStyle: "black", lineWidth: 0.5});
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        mesh.r_circulate_t(t_out, r);
        for (let t of t_out) {
            ctx.beginPath();
            ctx.moveTo(mesh.r_vertex[r][0], mesh.r_vertex[r][1]);
            ctx.lineTo(mesh.t_vertex[t][0], mesh.t_vertex[t][1]);
            ctx.stroke();
        }
    }
};

layers.noisyRegions = (style, levels, amplitude, seed, coloring) => (ctx, mesh) => {
    let out_s = [];
    setCanvasStyle(ctx, style, {lineJoin: 'bevel'});

    // TODO: calculate s_lines as part of the mesh
    let s_lines = NoisyEdges.assign_s_segments(mesh, levels, amplitude, makeRandInt(seed));
    
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        mesh.r_circulate_s(out_s, r);
        let last_t = mesh.s_inner_t(out_s[0]);
        ctx.fillStyle = ctx.strokeStyle = coloring(r);
        ctx.beginPath();
        ctx.moveTo(mesh.t_vertex[last_t][0], mesh.t_vertex[last_t][1]);
        for (let s of out_s) {
            for (let p of s_lines[s]) {
                ctx.lineTo(p[0], p[1]);
            }
        }

        ctx.stroke();
        ctx.fill();
    }
};

layers.noisyRegionSides = (style, levels, amplitude, seed, styling) => (ctx, mesh) => {
    let out_s = [];
    setCanvasStyle(ctx, style, {});

    // TODO: calculate s_lines as part of the mesh
    let s_lines = NoisyEdges.assign_s_segments(mesh, levels, amplitude, makeRandInt(seed));

    for (let s = 0; s < mesh.numSolidSides; s++) {
        let style = styling(s);
        if (style === null) { continue; }
        ctx.strokeStyle = style.strokeStyle;
        ctx.lineWidth = style.lineWidth;
        let last_t = mesh.s_inner_t(s);
        ctx.beginPath();
        ctx.moveTo(mesh.t_vertex[last_t][0], mesh.t_vertex[last_t][1]);
        for (let p of s_lines[s]) {
            ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
    }
};

/* coloring should be a function from r (region) to color string */
layers.regionColors = (style, coloring) => (ctx, mesh) => {
    let out_t = [];
    setCanvasStyle(ctx, style, {});
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        mesh.r_circulate_t(out_t, r);
        ctx.fillStyle = coloring(r);
        ctx.beginPath();
        ctx.moveTo(mesh.t_vertex[out_t[0]][0], mesh.t_vertex[out_t[0]][1]);
        for (let i = 1; i < out_t.length; i++) {
            ctx.lineTo(mesh.t_vertex[out_t[i]][0], mesh.t_vertex[out_t[i]][1]);
        }
        ctx.fill();
    }
};

layers.drawDrainage = (style, r_ocean, t_downslope_s) => (ctx, mesh) => {
    setCanvasStyle(ctx, style, {fillStyle: "hsl(230,50%,50%)", lineWidth: 30});
    for (let t1 = 0; t1 < mesh.numSolidTriangles; t1++) {
        let s = t_downslope_s[t1];
        if (s !== -1 && r_ocean[mesh.s_begin_r(s)]) { continue; }
        let t2 = s === -1? t1 : mesh.s_outer_t(s);
        if (t1 !== t2) {
            drawArrow(ctx, mesh.t_vertex[t1], mesh.t_vertex[t2]);
        }
    }
};
    
layers.drawRivers = (style, s_flow) => (ctx, mesh) => {
    setCanvasStyle(ctx, {}, {lineWidth: 2.5, strokeStyle: "hsl(230,50%,50%)"});
    let baseLineWidth = ctx.lineWidth;
    for (let s = 0; s < mesh.numSides; s++) {
        if (s_flow[s] > 0) {
            ctx.lineWidth = baseLineWidth * Math.sqrt(s_flow[s]);
            let r0 = mesh.s_begin_r(s);
            let r1 = mesh.s_end_r(s);
            let t0 = mesh.s_inner_t(s);
            let t1 = mesh.s_outer_t(s);
            ctx.beginPath();
            ctx.moveTo(mesh.t_vertex[t0][0], mesh.t_vertex[t0][1]);
            ctx.lineTo(mesh.t_vertex[t1][0], mesh.t_vertex[t1][1]);
            ctx.stroke();
        }
    }
};

layers.drawSprings = (style, river_t) => (ctx, mesh) => {
    setCanvasStyle(ctx, {}, {lineWidth: 1.0, fillStyle: "white", strokeStyle: "hsl(230,50%,50%)"});
    for (let t of river_t) {
        ctx.beginPath();
        ctx.arc(mesh.t_vertex[t][0], mesh.t_vertex[t][1], 3, 0, 2*Math.PI);
        ctx.fill();
        ctx.stroke();
    }
};
            

/* layers should be a list of functions that take (ctx, mesh) and draw the layer;
 * or null to skip that layer */
function diagram(canvas, mesh, options, layers) {
    const scale = util.fallback(options.scale, 1.0);
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width/1000, canvas.height/1000);
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.translate(500, 500); ctx.scale(scale, scale); ctx.translate(-500, -500);
    ctx.fillStyle = "hsl(60, 5%, 75%)";
    ctx.fillRect(0, 0, 1000, 1000);

    for (let layer of layers) {
        if (layer) { layer(ctx, mesh); }
    }
    
    ctx.restore();
}

function createCircumcenterMesh(mesh, mixture) {
    let t_vertex = [], out_r = [];
    for (var t = 0; t < mesh.numSolidTriangles; t++) {
        mesh.t_circulate_r(out_r, t);
        let a = mesh.r_vertex[out_r[0]],
            b = mesh.r_vertex[out_r[1]],
            c = mesh.r_vertex[out_r[2]];
        let center = util.circumcenter(a, b, c);
        t_vertex.push([util.mix(mesh.t_vertex[t][0], center[0], mixture),
                      util.mix(mesh.t_vertex[t][1], center[1], mixture)]);
    }
    for (; t < mesh.numTriangles; t++) {
        t_vertex.push(mesh.t_vertex[t]);
    }
    let newMesh = new DualMesh(mesh);
    newMesh.t_vertex = t_vertex;
    return newMesh;
}


function makeDiagram(selector, object) {
    object.container = document.querySelector(selector);
    object.canvas = object.container.querySelector("canvas");
    
    object.show = 'all';
    object.setShow = function(value) {
        object.show = value;
        object.redraw();
    };

    let spans = object.container.querySelectorAll(".hover-term");
    for (let span of spans) {
        span.addEventListener('mouseover', () => {
            object.setShow(span.getAttribute('data-show'));
        });
    }

    object.buttons = object.container.querySelectorAll("button");
    for (let button of object.buttons) {
        let name = button.getAttribute('name');
        object.buttons[name] = button;
        button.addEventListener('click', () => {
            object[name].apply(object);
            object.redraw();
        });
    }
    
    object.sliders = object.container.querySelectorAll("input[type='range']");
    for (let slider of object.sliders) {
        let name = slider.getAttribute('name');
        object.sliders[name] = slider;
        slider.value = object[name];
        slider.addEventListener('input', () => {
            object[name] = slider.valueAsNumber;
            object.redraw();
        });
    }

    object.recalculate = function() {
        this.r_water = Water.assign_r_water(this.mesh, util.fallback(this.noise, noise), {round: util.fallback(this.round, 0.5), inflate: util.fallback(this.inflate, 0.5)});
        this.r_ocean = Water.assign_r_ocean(this.mesh, this.r_water);
        this.elevationdata = Elevation.assign_t_elevation(this.mesh, this.r_ocean, this.r_water, makeRandInt(util.fallback(this.drainageSeed, SEED)));
        this.t_coastdistance = this.elevationdata.t_distance;
        this.t_elevation = this.elevationdata.t_elevation;
        this.t_downslope_s = this.elevationdata.t_downslope_s;
        this.r_elevation = Elevation.assign_r_elevation(this.mesh, this.t_elevation, this.r_ocean);
        this.spring_t = util.randomShuffle(Rivers.find_spring_t(this.mesh, this.r_water, this.t_elevation, this.t_downslope_s), makeRandInt(util.fallback(this.riverSeed, SEED)));
        this.river_t = this.spring_t.slice(0, util.fallback(this.numRivers, 5));
        this.s_flow = Rivers.assign_s_flow(this.mesh, this.t_downslope_s, this.river_t, this.t_elevation);
        this.r_moisture = Moisture.assign_r_moisture(this.mesh, this.r_water, Moisture.find_moisture_seeds_r(this.mesh, this.s_flow, this.r_ocean, this.r_water));
        this.r_biome = Biomes.assign_r_biome(this.mesh, this.r_ocean, this.r_water, this.r_elevation, this.r_moisture, util.fallback(this.temperatureBias, 0), util.fallback(this.moistureBias, 0));
    };
    
    object.redraw();
    return object;
}


let diagramMeshConstruction = makeDiagram(
    "#diagram-mesh-construction", {
        centroidCircumcenterMix: 0.0,
        mesh: mesh_75,
        redraw() {
            let show = this.show;
            diagram(this.canvas,
                    createCircumcenterMesh(this.mesh, this.centroidCircumcenterMix),
                    {scale: 0.9},
                    [
                        layers.triangleSides({globalAlpha: show==='all'||show==='delaunay'?1.0:show==='centroids'?0.3:0.1, lineWidth: 1.0}),
                        layers.regionSides({globalAlpha: show==='all'||show==='regions'?1.0:0.1, strokeStyle: "hsl(0,0%,95%)", lineWidth: 4.0}),
                        layers.regionCenters({globalAlpha: show==='all'||show==='delaunay'||show==='points'?1.0:0.2, radius: 7}),
                        layers.triangleCenters({globalAlpha: show==='all'||show==='regions'||show==='centroids'?1.0:0.2})
                    ]);
        },
    });


let diagramWaterAssignment = makeDiagram(
    "#diagram-water-assignment", {
        round: 0.5,
        inflate: 0.5,
        mesh: mesh_30,
        redraw() {
            this.recalculate();
            let show = this.show;
            let {r_water, r_ocean} = this;
            if (show === 'landwater') { r_ocean = r_water; }
            diagram(
                this.canvas, this.mesh, {},
                [
                    layers.regionColors({}, (r) => r_ocean[r]? "hsl(230,30%,50%)" : r_water[r]? (show === 'lakes'? "hsl(200,100%,50%)" : "hsl(200,30%,50%)") : "hsl(30,15%,60%)"),
                    layers.regionSides({strokeStyle: "black"}),
                    (show === 'connectivity' || show === 'lakes') && layers.triangleSidesColored({globalAlpha: show === 'lakes'? 0.3 : 1.0}, (_, r0, r1) => r_ocean[r0] && r_ocean[r1]? "white" : null),
                    show === 'all' && layers.regionSidesColored({lineWidth: 6.0}, (_, r0, r1, t0, t1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
                    layers.regionCenters({radius: 1.0, fillStyle: "hsl(0,0%,50%)", strokeStyle: "hsl(0,0%,50%)"})
                ]);
        },
    });


let diagramElevationAssignment = makeDiagram(
    "#diagram-elevation-assignment", {
        mesh: mesh_30,
        redraw() {
            this.recalculate();
            let {show, mesh, r_water, r_ocean, r_elevation, t_elevation, t_coastdistance} = this;
            let coasts_t = Elevation.find_coasts_t(this.mesh, r_ocean);

            function regionColoring(r) {
                if (r_ocean[r]) {
                    return `hsl(230,25%,${50+30*r_elevation[r]}%)`;
                } else if (r_water[r]) {
                    return `hsl(230,${15-10*r_elevation[r]}%,${60+30*r_elevation[r]}%)`;
                } else {
                    return `hsl(30,${25-10*r_elevation[r]}%,${50+50*r_elevation[r]}%)`;
                }
            }
            let config = null;
            switch (show) {
            case 'coast_t': config = [
                layers.regionColors({}, (r) => r_ocean[r]? "hsl(230,30%,60%)" : r_water[r]? "hsl(230,30%,60%)" : "hsl(30,15%,60%)"),
                layers.regionSidesColored({lineWidth: 1.5}, (_, r0, r1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
                layers.triangleCentersColored({radius: 5, strokeStyle: "white"}, (t) => coasts_t.indexOf(t) >= 0? "black" : null)
            ];
                break;
            case 't_coastdistance': config = [
                layers.regionColors({}, (r) => r_ocean[r]? "hsl(230,30%,60%)" : r_water[r]? "hsl(230,30%,60%)" : "hsl(30,20%,60%)"),
                layers.regionSides({strokeStyle: "black", lineWidth: 1.0, globalAlpha: 0.4}),
                layers.triangleCentersLabeled({}, (t) => ""+t_coastdistance[t])
            ];
                break;
            case 't_elevation': config = [
                layers.regionColors({}, (r) => r_ocean[r]? "hsl(230,30%,60%)" : "hsl(30,20%,60%)"),
                layers.regionSidesColored({lineWidth: 1.5}, (_, r0, r1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
                layers.triangleSidesColored(
                    {globalAlpha: 0.3}, (s) => {
                        let t0 = mesh.s_inner_t(s);
                        let t1 = mesh.s_outer_t(s);
                        return (Math.round(3*t_elevation[t0]) != Math.round(3*t_elevation[t1]))? "black" : null;
                    }
                ),
                layers.triangleCentersColored(
                    {radius: 5, strokeStyle: "white"}, (t) =>
                        t_elevation[t] == 0? "black"
                        : t_elevation[t] < 0? `hsl(230,50%,${-100*t_elevation[t]}%)`
                        : `hsl(60,25%,${100*t_elevation[t]}%)`)
            ];
                break;
            default: config = [
                layers.regionColors({}, regionColoring),
                layers.regionSidesColored({lineWidth: 1.0},
                                           (s, r0, r1) => Math.round(3*r_elevation[r0]) != Math.round(3*r_elevation[r1])? "black" : null),
                layers.regionSidesColored({lineWidth: 2.5}, (s, r0, r1) => r_ocean[r0] != r_ocean[r1]? "black" : null),
                layers.regionCenters({radius: 0.5, fillStyle: "black", strokeStyle: "black"})
            ];
            }
            diagram(this.canvas, this.mesh, {}, config);
        },
    });


let diagramDrainageAssignment = makeDiagram(
    "#diagram-drainage-assignment", {
        mesh: mesh_30,
        drainageSeed: 1,
        changeDrainageSeed() {
            this.drainageSeed = makeRandInt(this.drainageSeed)(100000);
        },
        redraw() {
            this.recalculate();
            let {show, mesh, r_water, r_ocean, r_elevation, t_elevation, t_downslope_s, t_coastdistance} = this;
            
            function regionColoring(r) {
                if (r_ocean[r]) {
                    return `hsl(230,25%,${50+30*r_elevation[r]}%)`;
                } else if (r_water[r]) {
                    return `hsl(230,${15-10*r_elevation[r]}%,${60+30*r_elevation[r]}%)`;
                } else {
                    return `hsl(30,${25-10*r_elevation[r]}%,${50+50*r_elevation[r]}%)`;
                }
            }
            
            diagram(this.canvas, mesh, {}, [
                layers.regionColors({}, regionColoring),
                layers.drawDrainage({}, r_ocean, t_downslope_s),
                layers.regionSidesColored({lineWidth: 2.0}, (_, r0, r1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
            ]);
        },
    });


let diagramRivers = makeDiagram(
    "#diagram-rivers", {
        mesh: mesh_30,
        numRivers: 5,
        riverSeed: 1,
        addRivers()       { this.numRivers += 10; },
        reset()           { this.numRivers = 0; },
        changeRiverSeed() { this.riverSeed = makeRandInt(this.riverSeed)(100000); },
        redraw() {
            this.recalculate();
            let {show, mesh, r_water, r_ocean, r_elevation, t_downslope_s, spring_t, s_flow} = this;
            this.sliders.numRivers.setAttribute('max', spring_t.length);

            function regionColoring(r) {
                if (r_ocean[r]) {
                    return `hsl(230,25%,${50+30*r_elevation[r]}%)`;
                } else if (r_water[r]) {
                    return `hsl(230,${15-10*r_elevation[r]}%,${60+30*r_elevation[r]}%)`;
                } else {
                    return `hsl(30,${25-10*r_elevation[r]}%,${50+50*r_elevation[r]}%)`;
                }
            }
            
            diagram(this.canvas, mesh, {}, [
                layers.regionColors({}, regionColoring),
                layers.drawDrainage({globalAlpha: 0.2}, r_ocean, t_downslope_s),
                layers.drawRivers({}, s_flow),
                layers.drawSprings({}, spring_t),
                layers.regionSidesColored({lineWidth: 2.0}, (_, r0, r1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
            ]);
        }
    });


let diagramMoistureAssignment = makeDiagram(
    "#diagram-moisture-assignment", {
        mesh: mesh_15,
        numRivers: 1,
        addRivers() { this.numRivers += 5; },
        reset() { this.numRivers  = 0; },
        redraw() {
            this.recalculate();
            let {show, mesh, r_water, r_ocean, r_elevation, t_downslope_s, s_flow, spring_t, river_t, r_moisture} = this;
            this.sliders.numRivers.setAttribute('max', spring_t.length);
            function regionColoring(r) {
                if (r_ocean[r]) {
                    return "hsl(230,25%,25%)";
                } else if (r_water[r]) {
                    return "hsl(230,50%,50%)";
                } else {
                    return `hsl(${30+120*r_moisture[r]},15%,${75-25*r_moisture[r]}%)`;
                }
            }
            
            let config = null;
            diagram(this.canvas, mesh, {}, [
                layers.regionColors({}, regionColoring),
                layers.drawRivers({}, s_flow),
                layers.drawSprings({}, river_t),
                layers.regionSidesColored({lineWidth: 1.5}, (_, r0, r1) => r_ocean[r0] !== r_ocean[r1]? "black" : null),
                layers.regionSidesColored({lineWidth: 0.3}, (_, r0, r1) => Math.round(5*r_moisture[r0]) != Math.round(5*r_moisture[r1]) ? "black" : null),
            ]);
        }
    });


let diagramBiomeAssignment = makeDiagram(
    "#diagram-biome-assignment", {
        mesh: mesh_30,
        seed: 1, // TODO: rename this seed
        noise: noise,
        numRivers: 5,
        temperatureBias: 0.0,
        moistureBias: 0.0,
        addRivers() { this.numRivers += 10; },
        reset() { this.numRivers  = 0; },
        nextSeed() { this.setSeed(this.seed+1); },
        prevSeed() { this.setSeed(this.seed-1); },
        setSeed(value) { this.seed = value; this.noise = new SimplexNoise(makeRandFloat(this.seed)); this.redraw(); },
        redraw() {
            this.recalculate();
            this.sliders.numRivers.setAttribute('max', this.spring_t.length);
            
            let r_biome = this.r_biome;
            diagram(this.canvas, this.mesh, {}, [
                layers.regionColors({}, (r) => biomeColors[r_biome[r]] || "red"),
                layers.regionSidesColored({lineWidth: 1.5}, (_, r0, r1) => (r_biome[r0] === 'OCEAN') !== (r_biome[r1] === 'OCEAN')? "black" : null),
                layers.regionSidesColored({lineWidth: 0.3}, (_, r0, r1) => r_biome[r0] !== r_biome[r1]? "black" : null),
                layers.drawRivers({lineWidth: 0.5}, this.s_flow),
            ]);
        }
    });


let diagramQuadrilateralTiling = makeDiagram(
    "#diagram-quadrilateral-tiling", {
        mesh: mesh_75,
        redraw() {
            this.recalculate();
            let r_biome = this.r_biome;
            diagram(this.canvas, this.mesh,
                    {scale: 1.2},
                    [
                        layers.regionSides({globalAlpha: 0.1}),
                        layers.quadrilateralSides({}),
                        layers.regionCenters({radius: 7}),
                        layers.triangleCenters({}),
                    ]);
        },
    });

let diagramNoisyEdges = makeDiagram(
    "#diagram-noisy-edges", {
        mesh: mesh_30,
        noisyEdgeLevels: 1,
        noisyEdgeAmplitude: 0.25,
        noisyEdgeSeed: SEED,
        redraw() {
            this.recalculate();
            let {mesh, s_flow, r_biome} = this;
            function styling(s) {
                let r0 = mesh.s_begin_r(s),
                    r1 = mesh.s_end_r(s);
                if (s_flow[s] > 0) {
                    return {
                        strokeStyle: "hsl(230,50%,50%)",
                        lineWidth: 5.0 * Math.sqrt(s_flow[s]),
                    };
                }
                if (r_biome[r0] !== r_biome[r1]) {
                    return {
                        lineWidth: (r_biome[r0] === 'OCEAN' || r_biome[r1] === 'OCEAN')? 3.0 : 0.2,
                        strokeStyle: "black",
                    };
                }
                return null;
            }

            diagram(this.canvas, mesh,
                    {},
                    [
                        layers.noisyRegions(
                             {},
                            this.noisyEdgeLevels,
                            this.noisyEdgeAmplitude,
                            this.noisyEdgeSeed,
                            (r) => biomeColors[r_biome[r]]
                        ),
                        layers.noisyRegionSides(
                            {},
                            this.noisyEdgeLevels,
                            this.noisyEdgeAmplitude,
                            this.noisyEdgeSeed,
                            styling
                        ),
                    ]);
        },
    });

let mapExport = makeDiagram(
    "#map-export", {
        mesh: mesh_75,
        redraw() { },
        export() {
            this.recalculate();
            let mesh = this.mesh;
            let t_points = mesh.t_vertex.map((p, t) => [Math.round(p[0]), Math.round(p[1]), this.t_elevation[t]]);
            let r_points = mesh.r_vertex.map((p, r) => [Math.round(p[0]), Math.round(p[1]), this.r_elevation[r]]);
            let r_biomes = this.r_biome;
            let r_moisture = this.r_moisture;
            let t_vertices_r = [];
            let r_vertices_t = [];
            for (let t = 0; t < mesh.numSolidTriangles; t++) {
                t_vertices_r.push(mesh.t_circulate_r([], t));
            }
            for (let r = 0; r < mesh.numSolidRegions; r++) {
                r_vertices_t.push(mesh.r_circulate_t([], r));
            }
            this.container.querySelector("textarea").value = JSON.stringify({r_biomes, t_vertices_r, r_vertices_t, t_points, r_points, r_moisture}, null, " ");
        },
    });

