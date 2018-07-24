/*
 * From http://www.redblobgames.com/x/1742-webgl-mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

const util = require('@redblobgames/mapgen2/util');

exports.lakes = function(ctx, map) {
    let {mesh} = map;
    let out_s = [];

    ctx.fillStyle = ctx.strokeStyle = "blue";
    ctx.lineWidth = 1.0;
    
    for (let r = 0; r < mesh.numSolidRegions; r++) {
        mesh.r_circulate_s(out_s, r);
        let last_t = mesh.s_inner_t(out_s[0]);
        if (!map.r_water[r] || map.r_ocean[r]) continue;
        ctx.beginPath();
        ctx.moveTo(mesh.t_x(last_t), mesh.t_y(last_t));
        for (let s of out_s) {
            for (let p of map.s_lines[s]) {
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.fill();
        ctx.stroke();
    }
};

exports.rivers = function(ctx, map) {
    let {mesh} = map;
    let end = mesh.numSolidSides;

    ctx.lineCap = "round";
    for (let s = 0; s < mesh.numSolidSides; s++) {
        let r0 = map.mesh.s_begin_r(s),
            r1 = map.mesh.s_end_r(s);
        if (map.s_flow[s] === 0) { continue; }
        let bri = 30 + Math.floor(50 / map.s_flow[s]);
        let t1 = mesh.s_inner_t(s), t2 = mesh.s_outer_t(s);
        ctx.strokeStyle = `hsl(200,50%,${bri}%)`;
        // TODO: line width needs to depend on how much space we have, e.g. in a canyon it would have to be narrow
        ctx.lineWidth = 0.1 * Math.sqrt(map.s_flow[s]);
        ctx.beginPath();
        ctx.moveTo(mesh.t_x(t1), mesh.t_y(t1));
        ctx.lineTo(mesh.t_x(t2), mesh.t_y(t2));
        ctx.stroke();
    }
};
