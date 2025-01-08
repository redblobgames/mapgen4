/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
 */
'use strict';

import {TriangleMesh} from "./dual-mesh/index.ts";
import Map      from "./map.ts";
import Geometry from "./geometry.ts";
import type {Mesh} from "./types.d.ts";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

// Draw any overlay annotations that should be "draped" over the terrain surface
function drawOverlay(ctx: OffscreenCanvasRenderingContext2D, map: Map) {
    ctx.reset();
    ctx.scale(2048/1000, 2048/1000); // mapgen4 draws to a 1000✕1000 region
    ctx.clearRect(0, 0, 1000, 1000);

    // A sample region
    ctx.save();
    ctx.translate(250, 325);
    ctx.rotate(2*Math.PI * 0.05);
    ctx.fillStyle = "hsl(300 100% 70% / 0.3)";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-100, -100, 200, 200);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Some sample text - valley floor in the default map
    ctx.save();
    ctx.translate(500, 525);
    ctx.rotate(2*Math.PI * 1/16);
    ctx.font = `25px sans-serif`;
    ctx.fillStyle = "black";
    ctx.fillText("Valley of Centaurs", 0, 0);
    ctx.restore();

    // Some sample text - mountain side in the default map
    ctx.save();
    ctx.translate(670, 500);
    ctx.rotate(2*Math.PI * -3/16);
    ctx.font = `20px sans-serif`;
    ctx.fillStyle = "black";
    ctx.fillText("Mountain Range", 0, 0);
    ctx.restore();

    // Find mouths of rivers, and place town icons there
    ctx.save();
    ctx.font = `25px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = "cyan";
    ctx.strokeStyle = "black"
    ctx.lineWidth = 3;
    for (let s = 0; s < map.mesh.numSolidTriangles; s++) {
        if (map.flow_s[s] > 20 &&
            map.elevation_r[map.mesh.r_begin_s(s)] >= 0.0 && map.elevation_r[map.mesh.r_end_s(s)] <= 0) {
            // This looks like the mouth of a river. TODO: it's not a reliable way to detect
            // them, and I'm not sure why
            let r_town = map.mesh.r_end_s(s);
            let pos = map.mesh.pos_of_r(r_town);
            ctx.strokeText("✪", pos[0], pos[1]);
            ctx.fillText("✪", pos[0], pos[1]);
        }
    }
    ctx.restore();
}


// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const overlayCanvas = event.data.overlayCanvas as OffscreenCanvas;
    const mesh = new TriangleMesh(event.data.mesh as TriangleMesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);

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
        let {param, constraints, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;

        let numRiverTriangles = 0;
        let start_time = performance.now();

        if (run.biomes) {
            map.assignElevation(param.elevation, constraints);
            map.assignRainfall(param.biomes);
        }
        if (run.rivers) {
            map.assignRivers(param.rivers);
        }
        if (run.biomes || run.rivers) {
            Geometry.setMapGeometry(map, new Int32Array(quad_elements_buffer), new Float32Array(a_quad_em_buffer));
        }
        if (run.rivers) {
            numRiverTriangles = Geometry.setRiverTextures(map, param.spacing, param.rivers, new Float32Array(a_river_xyuv_buffer));
        }

        drawOverlay(ctx, map);

        let elapsed = performance.now() - start_time;

        requestAnimationFrame(() => {
            worker.postMessage(
                {elapsed,
                 numRiverTriangles,
                 quad_elements_buffer,
                 a_quad_em_buffer,
                 a_river_xyuv_buffer,
                },
                [
                    quad_elements_buffer,
                    a_quad_em_buffer,
                    a_river_xyuv_buffer,
                ]
            );
        });
    };
};


onmessage = event => handler(event);
