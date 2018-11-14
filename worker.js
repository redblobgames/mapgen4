/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
 */
'use strict';

const DualMesh = require('@redblobgames/dual-mesh');
const Map      = require('./map');
const Geometry = require('./geometry');

/**
 * @typedef { import("./types").Mesh } Mesh
 */

function Worker(self) {
    // This handler is for the initial message
    let handler = event => {
        const param = event.data.param;

        // NOTE: web worker messages only include the data; to
        // reconstruct the full object I call the constructor again
        // and then copy the data over
        const mesh = /** @type{Mesh} */(new DualMesh(event.data.mesh));
        Object.assign(mesh, event.data.mesh);
        
        const map = new Map(mesh, event.data.peaks_t, param);

        // TODO: placeholder
        const run = {elevation: true, biomes: true, rivers: true};
        
        // This handler is for all subsequent messages
        handler = event => {
            let {param, constraints, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;

            let numRiverTriangles = 0;
            let start_time = performance.now();
            
            if (run.elevation) { map.assignElevation(param.elevation, constraints); }
            if (run.biomes) { map.assignRainfall(param.biomes); }
            if (run.rivers) { map.assignRivers(param.rivers); }
            if (run.elevation || run.rivers) {
                Geometry.setMapGeometry(map, new Int32Array(quad_elements_buffer), new Float32Array(a_quad_em_buffer));
            }
            if (run.rivers) { numRiverTriangles = Geometry.setRiverTextures(map, param.spacing, param.rivers, new Float32Array(a_river_xyuv_buffer)); }
            let elapsed = performance.now() - start_time;

            self.postMessage(
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
        
    self.addEventListener('message', event => handler(event));
}

module.exports = Worker;
