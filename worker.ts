/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
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
function mod(a: number, b: number): number { return (a % b + b) % b; }

const NUM_PATH_GROUPS = 1000;
const PATHS_PER_GROUP = 30;
class Travel {
    tick: number;
    map: Map;
    paths: Array<Array<[number, number, number, number]>>;
    randInt: (max: number) => number;

    constructor (map: Map) {
        this.tick = 0;
        this.map = map;
        this.randInt = makeRandInt(12345);
        // TODO: this isn't great; we need each individual path to have an expiration time
        // because they can be different lengths, so they can't go into groups; instead,
        // generate a new path when the previous one expires. So I need to have startTick,endTick
        // on each path. This also has the benefit of separating speed from groups, and I can
        // have some routes be slower than others. But eventually I'll need to do that anyway
        // to show slow movement through forest etc.
        this.paths = Array.from({length: NUM_PATH_GROUPS}, () => this.constructParticleGroup());
    }

    constructParticleGroup(): Array<[number, number, number, number]> {
        let group = [];
        for (let i = 0; i < PATHS_PER_GROUP; i++) {
            let r1 = this.randInt(this.map.mesh.numSolidRegions);
            let r2 = this.randInt(this.map.mesh.numSolidRegions);
            let pos1 = this.map.mesh.pos_of_r(r1);
            let pos2 = this.map.mesh.pos_of_r(r2);
            pos2 = [-(pos1[1]-500) + 500, pos1[0]]; // HACK: rotational movement only
            group.push([pos1[0], pos1[1], pos2[0], pos2[1]]);
        }
        return group;
    }

    simulate() {
        this.paths[this.tick % NUM_PATH_GROUPS] = this.constructParticleGroup();
        this.tick++;
    }

    particles() {
        // Calculate the current particle positions
        let positions = [];
        for (let j = 0; j < this.paths.length; j++) {
            for (let i = 0; i < this.paths[j].length; i++) {
                let [x1, y1, x2, y2] = this.paths[j][i];
                let t = mod((i - this.tick), NUM_PATH_GROUPS) / NUM_PATH_GROUPS;
                positions.push([lerp(x1, x2, t), lerp(y1, y2, t)]);
            }
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
