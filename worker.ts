/*
 * From https://www.redblobgames.com/x/2515-mapgen-trading/
 * Copyright 2018, 2025 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data,
 * simulates the traders, and renders everything to <canvas> elements.
 */

import {makeRandInt}  from '@redblobgames/prng';
import {TriangleMesh} from "./dual-mesh/index.ts";
import Map            from "./map.ts";
import type {Mesh}    from "./types.d.ts";
import * as Draw      from "./draw.js";
import * as Colormap2 from "./colormap2.js";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

function lerp(a: number, b: number, t: number): number { return a * (1-t) + b * t; }
function unlerp(a: number, b: number, t: number): number { return (t - a) / (b - a); }
function rescale(v: number, from_lo: number, from_hi: number, to_lo: number, to_hi: number): number { return lerp(to_lo, to_hi, unlerp(from_lo, from_hi, v)); }
function mod(a: number, b: number): number { return (a % b + b) % b; }


type Waypoint = {x: number, y: number, at: number};

const NUM_PATHS = 50000;
const PARTICLE_SPEED = 3;
class Travel {
    tick: number;
    map: Map;
    paths: Array<Array<Waypoint>>; // stored in reverse order
    randInt: (max: number) => number;

    constructor (map: Map) {
        this.tick = 0;
        this.map = map;
        this.randInt = makeRandInt(12345);
        this.paths = Array.from({length: NUM_PATHS}, () => this.constructParticle());
    }

    constructParticle(): Array<Waypoint> {
        const SPREAD = 5.0;
        let r1 = this.randInt(this.map.mesh.numSolidRegions);
        let r2 = this.randInt(this.map.mesh.numSolidRegions);
        let [x1, y1] = this.map.mesh.pos_of_r(r1);
        let [x2, y2] = this.map.mesh.pos_of_r(r2);
        x1 += SPREAD * (Math.random() - Math.random());
        y1 += SPREAD * (Math.random() - Math.random());
        [x2, y2] = [-(y1-500) + 500, x1]; // HACK: rotational movement only
        return [ // reverse order
            {x: x2, y: y2, at: this.tick + Math.ceil(Math.hypot(x1-x2, y1-y2) / PARTICLE_SPEED)},
            {x: x1, y: y1, at: this.tick},
        ];
    }

    simulate() {
        // Move along paths, and generate new path once one has expired
        for (let i = 0; i < this.paths.length; i++) {
            while (this.paths[i].length > 1 && this.tick >= this.paths[i].at(-2).at) {
                this.paths[i].pop(); // waypoint expired
            }
            if (this.paths[i].length === 1) { // entire path expired
                this.paths[i] = this.constructParticle();
            }
            if (this.paths[i].length === 0) {
                throw "Invalid empty path";
            }
            // NOTE it can still be possible to get a too short path here, if start and end points were the same
        }

        this.tick++;
    }

    particles() {
        // Calculate the current particle positions
        let positions = [];
        for (let i = 0; i < this.paths.length; i++) {
            if (this.paths[i].length < 2) continue;
            let p1 = this.paths[i].at(-1),
                p2 = this.paths[i].at(-2);
            let t = unlerp(p1.at, p2.at, this.tick);
            positions.push([lerp(p1.x, p2.x, t), lerp(p1.y, p2.y, t)]);
        }
        return positions;
    }
}

// Draw the mapgen2 output for mapgen4 maps
function renderMap(ctx: OffscreenCanvasRenderingContext2D, param: any, mapIconsConfig: any, map: Map) {
    ctx.reset();
    ctx.scale(2048/1000, 2048/1000); // mapgen4 draws to a 1000✕1000 region
    ctx.clearRect(0, 0, 1000, 1000);

    const noisyEdges = false;
    const colormap = new Colormap2.Smooth();
    colormap.riversParam = param.rivers;
    colormap.spacingParam = param.spacing;
    Draw.background(ctx, colormap);
    Draw.noisyRegions(ctx, map, colormap, noisyEdges);
    Draw.rivers(ctx, map, colormap, noisyEdges, true);
    Draw.coastlines(ctx, map, colormap, noisyEdges);
    Draw.regionIcons(ctx, map, mapIconsConfig, makeRandInt(12345));
}

function renderOverlay(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, map: Map, travel: Travel) {
    const size = canvas.width;
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    pixels.fill(0);
    let particles = travel.particles();
    for (let i = 0; i < particles.length; i++) {
        let [x, y] = particles[i];
        x = lerp(0, size, x/1000.0) | 0;
        y = lerp(0, size, y/1000.0) | 0;
        if (0 <= x && x < size && 0 <= y && y < size) {
            let start = 4 * (y * size + x);
            for (let channel = 0; channel < 3; channel++) { // r, g, b
                pixels[start+channel] = 255; // white for now
            }
            pixels[start+3] = 255; // alpha
        }
    }
    ctx.putImageData(imageData, 0, 0);
}


// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const mapCanvas = event.data.mapCanvas as OffscreenCanvas;
    const overlayCanvas = event.data.overlayCanvas as OffscreenCanvas;
    const mesh = new TriangleMesh(event.data.mesh as TriangleMesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);
    const mapIconsConfig = event.data.mapIconsConfig;
    mapIconsConfig.image = event.data.mapIconsBitmap;

    const ctxMap = mapCanvas.getContext('2d');
    const ctxOverlay = overlayCanvas.getContext('2d', {willReadFrequently: true});
    ctxOverlay.imageSmoothingEnabled = false;
    let param = null;

    let travel = new Travel(map);
    function tick() {
        travel.simulate();
        // NOTE: have to put this in requestAnimationFrame to avoid flickering
        // with an offscreen canvas
        requestAnimationFrame(() => renderOverlay(overlayCanvas, ctxOverlay, map, travel));
    }
    setInterval(tick, 1000/15);

    // This handler is for all subsequent messages, and it only gets
    // called after the user changes the map by painting
    handler = (event) => {
        let {constraints, outputBoundingRect} = event.data;
        param = event.data.param;

        let numRiverTriangles = 0;
        let start_time = performance.now();
        
        map.assignElevation(param.elevation, constraints);
        map.assignRainfall(param.biomes);
        map.assignRivers(param.rivers);

        let newOverlaySize = Math.floor(outputBoundingRect.width);
        if (newOverlaySize !== overlayCanvas.width) { // resetting size erases canvas, so do it only when it changes
            overlayCanvas.width = overlayCanvas.height = newOverlaySize;
        }
        renderMap(ctxMap, param, mapIconsConfig, map);

        let elapsed = performance.now() - start_time;

        worker.postMessage(
            {elapsed,
             numRiverTriangles,
            }
        );
    };
};


onmessage = event => handler(event);
