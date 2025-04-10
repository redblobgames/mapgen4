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

// Draw any overlay annotations that should be "draped" over the terrain surface
function drawOverlay(ctx: OffscreenCanvasRenderingContext2D, param: any, mapIconsConfig: any, map: Map) {
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
    // Draw.noisyEdges(ctx, map, colormap, noisyEdges, 15);]
    Draw.coastlines(ctx, map, colormap, noisyEdges);
    Draw.regionIcons(ctx, map, mapIconsConfig, makeRandInt(12345));
}


// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const overlayCanvas = event.data.overlayCanvas as OffscreenCanvas;
    const mesh = new TriangleMesh(event.data.mesh as TriangleMesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);
    const mapIconsConfig = event.data.mapIconsConfig;
    mapIconsConfig.image = event.data.mapIconsBitmap;

    const ctx = overlayCanvas.getContext('2d');

    // TODO: placeholder - calculating elevation+biomes takes 35% of
    // the time on my laptop, and seeing the elevation change is the
    // most important thing to do every frame, so it might be worth
    // splitting this work up into multiple frames where
    // elevation+biomes happen every frame but rivers happen every N
    // frames. To do this I could either put the logic on the caller
    // side to decide on partial vs full update, or have the code here
    // decide. The advantage of deciding here is that we have the
    // timing information and can do full updates on faster machines
    // and partial updates on slower machines. But the advantage of
    // deciding in the caller is that it knows whether there's
    // painting going on, and can sneak in river updates while the
    // user has stopped painting.
    const run = {biomes: true, rivers: true};
    
    // This handler is for all subsequent messages
    handler = (event) => {
        let {param, constraints} = event.data;

        let numRiverTriangles = 0;
        let start_time = performance.now();
        
        if (run.biomes) {
            map.assignElevation(param.elevation, constraints);
            map.assignRainfall(param.biomes);
        }
        if (run.rivers) {
            map.assignRivers(param.rivers);
        }

        drawOverlay(ctx, param, mapIconsConfig, map);

        let elapsed = performance.now() - start_time;

        worker.postMessage(
            {elapsed,
             numRiverTriangles,
            }
        );
    };
};


onmessage = event => handler(event);
