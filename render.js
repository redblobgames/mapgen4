/*
 * From http://www.redblobgames.com/x/1742-webgl-mapgen2/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

/* global dat */

'use strict';

let {vec3, mat4} = require('gl-matrix');
let colormap = require('./colormap');
let geometry = require('./geometry');
let regl = require('regl')({canvas: "#lighting"});

const param = {
    exponent: 4.0,
    em: {
        e: 0.0, // 0.03,
    },
    drape: {
        light_angle_deg: 120,
        slope: 5,
        flat: 5,
        c: 0.25,
        d: 6,
        mix: 0.5,
        rotate_x: Math.PI + 0.2,
        rotate_z: 0,
        scale_z: 1.5,
        outline_depth: 1.2,
        outline_strength: 20,
        outline_threshold: 0.0,
    },
};
exports.param = param;

const fbo_texture_size = 2000;
const fbo_em_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_em = regl.framebuffer({color: [fbo_em_texture]});
const fbo_z_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: [fbo_z_texture]});


/* write 16-bit elevation and 8-bit moisture to a texture */
let drawElevationMoisture = regl({
    frag: `
precision mediump float;
uniform sampler2D u_water;
varying vec2 v_position;
varying vec3 v_emn;
uniform float u_e;
void main() {
   float water = texture2D(u_water, v_position).b;
   float e = 0.5 * (1.0 + v_emn.x);
   if (e > 0.5) { e -= u_e * water; }
   else { e -= 0.01; }
   gl_FragColor = vec4(fract(256.0*e), e, v_emn.y, 1);
}`,

    vert: `
precision mediump float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_position;
attribute vec3 a_emn;
varying vec2 v_position;
varying vec3 v_emn;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, 0, 1));
    v_position = 0.5 * (1.0 + pos.xy);
    v_emn = vec3(a_emn.x < 0.0? a_emn.x : pow(a_emn.x, u_exponent), a_emn.y, a_emn.z);
    gl_Position = pos;
}`,

    uniforms:  {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
        u_water: regl.prop('u_water'),
        u_e: () => param.em.e,
    },

    framebuffer: fbo_em,
    count: regl.prop('count'),
    attributes: {
        a_position: regl.prop('a_position'),
        a_emn: regl.prop('a_emn'),
    },
});


/* write depth to a texture, after applying perspective; used for outline shader */
// TODO: float texture?
let drawDepth = regl({
    frag: `
precision mediump float;
varying float v_z;
void main() {
   gl_FragColor = vec4(v_z, v_z, v_z, 1);
}`,

    vert: `
precision mediump float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_position;
attribute vec3 a_emn;
varying float v_z;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, pow(max(0.0, a_emn.x), u_exponent), 1));
    v_z = a_emn.x;
    gl_Position = pos;
}`,

    framebuffer: fbo_z,
    count: regl.prop('count'),
    attributes: {
        a_position: regl.prop('a_position'),
        a_emn: regl.prop('a_emn'),
    },
    uniforms: {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
    },
});


/* draw the final image by draping the biome colors over the geometry */
let drawDrape = regl({
    frag: `
precision mediump float;
uniform sampler2D u_colormap;
uniform sampler2D u_mapdata;
uniform sampler2D u_water;
uniform sampler2D u_depth;
uniform float u_light_angle_rad;
uniform float u_inverse_texture_size, 
              u_slope, u_flat,
              u_c, u_d, u_mix,
              u_outline_strength, u_outline_depth, u_outline_threshold;
varying vec2 v_uv, v_pos;
void main() {
   vec2 sample_offset = vec2(0.5*u_inverse_texture_size, 0.5*u_inverse_texture_size);
   vec2 pos = v_uv + sample_offset;
   vec2 dx = vec2(u_inverse_texture_size, 0),
        dy = vec2(0, u_inverse_texture_size);
   vec4 decipher = vec4(1.0/256.0, 1, 0, 0);
   float zE = dot(texture2D(u_mapdata, pos + dx), decipher);
   float zN = dot(texture2D(u_mapdata, pos - dy), decipher);
   float zW = dot(texture2D(u_mapdata, pos - dx), decipher);
   float zS = dot(texture2D(u_mapdata, pos + dy), decipher);
   vec3 slope_vector = normalize(vec3(zS-zN, zE-zW, u_d*2.0*u_inverse_texture_size));
   vec3 light_vector = normalize(vec3(cos(u_light_angle_rad), sin(u_light_angle_rad), mix(u_slope, u_flat, slope_vector.z)));
   float light = u_c + max(0.0, dot(light_vector, slope_vector));
   vec2 em = texture2D(u_mapdata, pos).yz;
   vec4 biome_color = texture2D(u_colormap, em);
   vec4 water_color = texture2D(u_water, pos);

   float depth0 = texture2D(u_depth, v_pos + sample_offset).x,
         depth1 = max(texture2D(u_depth, v_pos + sample_offset + u_outline_depth*(-dy+dx)).x,
                      texture2D(u_depth, v_pos + sample_offset + u_outline_depth*(-dy-dx)).x);
   float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, depth1-depth0) - u_outline_threshold);

   // gl_FragColor = vec4(light, light, light, 1);
   // gl_FragColor = vec4(biome_color, 1);
   // gl_FragColor = texture2D(u_mapdata, v_uv);
   gl_FragColor = vec4(mix(biome_color, water_color, u_mix * sqrt(water_color.a)).rgb * light / outline, 1);
}`,

    vert: `
precision mediump float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_position;
attribute vec3 a_emn;
varying vec2 v_uv, v_pos;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, pow(max(0.0, a_emn.x), u_exponent), 1));
    v_uv = vec2(a_position.x / 1000.0, a_position.y / 1000.0);
    v_pos = (1.0 + pos.xy) * 0.5;
    gl_Position = pos;
}`,

    count: regl.prop('count'),
    attributes: {
        a_position: regl.prop('a_position'),
        a_emn: regl.prop('a_emn'),
    },
    uniforms: {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
        u_depth: regl.prop('u_depth'),
        u_colormap: regl.texture({width: colormap.width, height: colormap.height, data: colormap.data, wrapS: 'clamp', wrapT: 'clamp'}),
        u_mapdata: () => fbo_em_texture,
        u_water: regl.prop('u_water'),
        u_inverse_texture_size: 1.5 / fbo_texture_size,
        u_light_angle_rad: () => Math.PI/180 * param.drape.light_angle_deg,
        u_slope: () => param.drape.slope,
        u_flat: () => param.drape.flat,
        u_c: () => param.drape.c,
        u_d: () => param.drape.d,
        u_mix: () => param.drape.mix,
        u_outline_depth: () => param.drape.outline_depth,
        u_outline_strength: () => param.drape.outline_strength,
        u_outline_threshold: () => param.drape.outline_threshold,
    },
});

let redraw;
exports.draw = function(map, water_bitmap) {
    let FRAME = 0, T1 = console.time, T2 = console.timeEnd;

    let topdown = mat4.create();
    mat4.translate(topdown, topdown, [-1, -1, 0, 0]);
    mat4.scale(topdown, topdown, [1/500, 1/500, 1, 1]);

    T1('make-mesh');
    let {a_position, a_emn} = geometry.make(map);
    T2('make-mesh');
    
    T1('make-water-texture');
    let u_water = regl.texture({data: water_bitmap, wrapS: 'clamp', wrapT: 'clamp'});
    T2('make-water-texture');
    
    redraw = () => {

        T1(`draw-emn ${a_position.length}`);
        // Use regl scopes to bind regl.clear to the framebuffer to clear it
        regl({framebuffer: fbo_em})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
        drawElevationMoisture({a_position, a_emn, u_water, u_projection: topdown, count: a_position.length});
        T2(`draw-emn ${a_position.length}`);

        let projection = mat4.create();
        mat4.rotateX(projection, projection, param.drape.rotate_x);
        mat4.rotateZ(projection, projection, param.drape.rotate_z);
        mat4.translate(projection, projection, [-1, -1, 0, 0]);
        mat4.scale(projection, projection, [1/500, 1/500, param.drape.scale_z, 1]);
        
        T1('draw-depth');
        if (param.drape.outline_depth > 0) {
            regl({framebuffer: fbo_z})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
            drawDepth({u_water, a_position, a_emn, u_projection: projection, count: a_position.length});
        }
        T2('draw-depth');
        
        T1('draw-drape');
        regl.clear({color: [0, 0, 0, 1], depth: 1});
        drawDrape({u_water, u_depth: fbo_z_texture, a_position, a_emn, u_projection: projection, count: a_position.length});
        T2('draw-drape');

        if (FRAME++ > 2) {
            T1 = T2 = () => {}; // only show performance the first few times
        }
    };
    redraw();
};


let G = new dat.GUI();
G.add(param, 'exponent', 1, 10);
G.add(param.em, 'e', 0, 0.1);
G.add(param.drape, 'light_angle_deg', 0, 360);
G.add(param.drape, 'slope', 0, 10);
G.add(param.drape, 'flat', 0, 10);
G.add(param.drape, 'c', 0, 1);
G.add(param.drape, 'd', 0, 40);
G.add(param.drape, 'mix', 0, 2);
G.add(param.drape, 'rotate_x', -2*Math.PI, 2*Math.PI);
G.add(param.drape, 'rotate_z', -2*Math.PI, 2*Math.PI);
G.add(param.drape, 'scale_z', 0, 2);
G.add(param.drape, 'outline_depth', 0, 5);
G.add(param.drape, 'outline_strength', 0, 30);
G.add(param.drape, 'outline_threshold', 0, 0.1);
function update() {
    redraw();
}
for (let c of G.__controllers) c.listen().onChange(update);
exports.datGUI = G;
