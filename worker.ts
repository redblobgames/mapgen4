/*
 * From https://www.redblobgames.com/x/2515-mapgen-trading/
 * Copyright 2018, 2025 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data,
 * simulates the travelers, and renders everything to <canvas> elements.
 */

import {makeRandInt}  from '@redblobgames/prng';
import {TriangleMesh} from "./dual-mesh/index.ts";
import Map            from "./map.ts";
import type {Mesh}    from "./types.d.ts";
import {Travelers}    from "./simulate.ts";
import * as Draw      from "./draw.js";
import * as Colormap  from "./colormap.js";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

function lerp(a: number, b: number, t: number): number { return a * (1-t) + b * t; }


// Draw the mapgen2 output for mapgen4 maps
function renderMap(ctx: OffscreenCanvasRenderingContext2D, param: any, mapIconsConfig: any, map: Map) {
    ctx.reset();
    ctx.scale(2048/1000, 2048/1000); // mapgen4 draws to a 1000✕1000 region
    ctx.clearRect(0, 0, 1000, 1000);

    const noisyEdges = false;
    const colormap = new Colormap.Smooth();
    colormap.riversParam = param.rivers;
    colormap.spacingParam = param.spacing;
    Draw.background(ctx, colormap);
    Draw.noisyRegions(ctx, map, colormap, noisyEdges);
    Draw.rivers(ctx, map, colormap, noisyEdges, true);
    Draw.coastlines(ctx, map, colormap, noisyEdges);
    Draw.regionIcons(ctx, map, mapIconsConfig, makeRandInt(12345));
}

// Draw the travelers moving around the map
function renderOverlay(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, map: Map, travel: Travelers) {
    const size = canvas.width;
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    // Suppose the "reference" resolution is 1024✕1024. Then one pixel
    // uses 1/1024² of the space. But if the resolution is instead
    // 2048✕2048, then one pixel uses ¼ as much space, so I want it to
    // be 4✕ as bright. So let's say 128 is the reference brightness
    // at 1024✕1024, and scale it up or down.
    const pixelBrightnessAdjust = (size/1024) ** 2;
    const pixelBrightness = (128 * pixelBrightnessAdjust) | 0;

    pixels.fill(0);
    let particles = travel.particles();
    for (let i = 0; i < particles.length; i++) {
        let [x, y] = particles[i];
        x = lerp(0, size, x/1000.0) | 0;
        y = lerp(0, size, y/1000.0) | 0;
        if (0 <= x && x < size && 0 <= y && y < size) {
            let start = 4 * (y * size + x);
            for (let channel = 0; channel < 3; channel++) {
                pixels[start+channel] = 255; // white for now
            }
            pixels[start+3] += pixelBrightness;
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

    let travel = new Travelers(map);
    let lastTickRanAtMs = Date.now();
    function tickMaybe() {
        const TICKS_PER_SECOND = 15;
        const MS_BETWEEN_TICKS = 1000/TICKS_PER_SECOND;
        let nowMs = Date.now();
        if (nowMs - lastTickRanAtMs > MS_BETWEEN_TICKS) {
            lastTickRanAtMs = nowMs;
            travel.simulate();
            renderOverlay(overlayCanvas, ctxOverlay, map, travel);
        }
        // NOTE: I use requestAnimationFrame instead of setInterval so
        // that it stops when the page isn't visible. I could use the
        // page visibility api but it's not available in workers, so I
        // would have to put it in the main thread and then have a
        // message which seemed like more work than doing this.
        requestAnimationFrame(tickMaybe);
    }
    tickMaybe();

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

        travel.updateCache(param.pathfinding);

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
