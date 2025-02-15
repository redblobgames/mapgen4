/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
 */

import {TriangleMesh} from "./dual-mesh/index.ts";
import Map      from "./map.ts";
import Geometry from "./geometry.ts";
import type {Mesh} from "./types.d.ts";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const mesh = new TriangleMesh(event.data.mesh as TriangleMesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);

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
        let elapsed = performance.now() - start_time;

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
    };
};


onmessage = event => handler(event);
