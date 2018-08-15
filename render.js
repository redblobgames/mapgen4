/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

/* global dat */

'use strict';

let {vec3, mat4} = require('gl-matrix');
let colormap = require('./colormap');
let Geometry = require('./geometry');
let regl = require('regl')({
    canvas: "#mapgen4",
    extensions: ['OES_element_index_uint', 'OES_standard_derivatives']
});

const param = {
    exponent: 2.5,
    distance: 480,
    x: 500,
    y: 500,
    drape: {
        light_angle_deg: 80,
        slope: 1,
        flat: 2.5,
        c: 0.25,
        d: 12,
        mix: 0.5,
        rotate_x_deg: 190,
        rotate_z_deg: 0,
        scale_z: 0.5,
        outline_depth: 1.2,
        outline_strength: 15,
        outline_threshold: 0,
    },
};
exports.param = param;

const river_texturemap = regl.texture({data: Geometry.createRiverBitmap(), mipmap: 'nice', min: 'mipmap', mag: 'linear'});
const fbo_texture_size = 2000;
const fbo_em_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_em = regl.framebuffer({color: [fbo_em_texture]});
const fbo_depth_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: [fbo_depth_texture]});
const fbo_river_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_river = regl.framebuffer({color: [fbo_river_texture]});


class Renderer {
    constructor (mesh) {
        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_w = new Int8Array(mesh.numRegions + mesh.numTriangles);
        this.quad_elements = new Int32Array(3 * mesh.numSolidSides);
        this.a_river_xy = new Float32Array(3 * 2 * mesh.numSolidTriangles);
        this.a_river_uv = new Float32Array(3 * 2 * mesh.numSolidTriangles);
        
        Geometry.setMeshGeometry(mesh, this.a_quad_xy, this.a_quad_w);
        Geometry.setRiverGeometry(mesh, this.a_river_xy);
        
        this.buffer_quad_xy = regl.buffer({
            usage: 'static',
            type: 'float',
            data: this.a_quad_xy,
        });

        this.buffer_quad_w = regl.buffer({
            usage: 'static',
            type: 'int8',
            data: this.a_quad_w,
        });

        this.buffer_quad_em = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_quad_em.length,
        });

        this.buffer_quad_elements = regl.elements({
            primitive: 'triangles',
            usage: 'dynamic',
            type: 'uint32',
            length: 4 * this.quad_elements.length,
            count: this.quad_elements.length,
        });

        this.buffer_river_xy = regl.buffer({
            usage: 'static',
            type: 'float',
            data: this.a_river_xy,
        });

        this.buffer_river_uv = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_river_uv.length,
        });
    }

    /* Update the buffers with the latest em, elements data */
    updateLand(map) {
        Geometry.setMapGeometry(map, this.quad_elements, this.a_quad_em);
        this.buffer_quad_em.subdata(this.a_quad_em);
        this.buffer_quad_elements.subdata(this.quad_elements);
    }
    
    updateWater(map, spacing) {
        Geometry.setRiverTextures(map, spacing, this.a_river_uv);
        this.buffer_river_uv.subdata(this.a_river_uv);
    }
}


/* draw rivers to a texture, which will be draped on the map surface */
let drawRivers = regl({
    frag: `
precision mediump float;
uniform sampler2D u_rivertexturemap;
varying vec2 v_uv;
void main() {
   gl_FragColor = texture2D(u_rivertexturemap, v_uv);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy, a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(u_projection * vec4(a_xy, 0, 1));
}`,
    
    uniforms:  {
        u_projection: regl.prop('u_projection'),
        u_rivertexturemap: river_texturemap,
    },

    framebuffer: fbo_river,
    depth: {
        enable: false,
    },
    count: regl.prop('count'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_uv: regl.prop('a_uv'),
    },
});


/* write 16-bit elevation and 8-bit moisture to a texture */
let drawElevationMoisture = regl({
    frag: `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 v_em;
varying float v_w, v_flow;
void main() {
   float e = 0.5 * (1.0 + v_em.x);
   float w = 1.0 - smoothstep(0.5, 1.5, v_w / fwidth(v_w));
   if (e < 0.5) { e -= 0.005; w = 1.0; } // produces the border
   gl_FragColor = vec4(fract(256.0*e), e, w, w);
   // NOTE: it should be using the floor instead of rounding, but
   // rounding produces a nice looking artifact, so I'll keep that
   // until I can produce the artifact properly (e.g. bug → feature).
   // Using linear filtering on the texture also smooths out the artifacts.
   //  gl_FragColor = vec4(fract(256.0*e), floor(256.0*e)/256.0, v_em.y, 1);
}`, // TODO: < 0.5 vs <= 0.5 produce significantly different results

    vert: `
precision highp float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_xy;
attribute vec2 a_em;
attribute float a_w, a_flow;
varying vec2 v_em;
varying float v_w, v_flow;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, 0, 1));
    v_em = vec2(a_em.x < 0.0? a_em.x : pow(a_em.x, u_exponent), a_em.y);
    v_w = a_w;
    v_flow = a_flow;
    gl_Position = pos;
}`,

    uniforms:  {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
    },

    framebuffer: fbo_em,
    depth: {
        enable: false,
    },
    elements: regl.prop('elements'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_em: regl.prop('a_em'),
        a_w: regl.prop('a_w'),
        a_flow: regl.prop('a_flow'),
    },
});


/* write depth to a texture, after applying perspective; used for outline shader */
// TODO: float texture?
let drawDepth = regl({
    frag: `
precision highp float;
varying float v_z;
void main() {
   gl_FragColor = vec4(v_z, v_z, v_z, 1);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_xy;
attribute vec2 a_em;
varying float v_z;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, pow(max(0.0, a_em.x), u_exponent), 1));
    v_z = a_em.x;
    gl_Position = pos;
}`,

    framebuffer: fbo_z,
    elements: regl.prop('elements'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_em: regl.prop('a_em'),
    },
    uniforms: {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
    },
});


/* draw the final image by draping the biome colors over the geometry */
let drawDrape = regl({
    frag: `
precision highp float;
uniform sampler2D u_colormap;
uniform sampler2D u_mapdata;
uniform sampler2D u_water;
uniform sampler2D u_depth;
uniform vec2 u_light_angle;
uniform float u_inverse_texture_size, 
              u_slope, u_flat,
              u_c, u_d, u_mix,
              u_outline_strength, u_outline_depth, u_outline_threshold;
varying vec2 v_uv, v_pos;
varying float v_m;

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
   vec3 light_vector = normalize(vec3(u_light_angle, mix(u_slope, u_flat, slope_vector.z)));
   float light = u_c + max(0.0, dot(light_vector, slope_vector));
   vec2 em = texture2D(u_mapdata, pos).yz;
   if (em.x > 0.7) { em.x = 2.0 * (em.x-0.7) + 0.7; } /* HACK: for noise-based elevation */
   // if (em.x >= 0.5 && em.y > 0.5) { em.x = 0.49; }
   em.y = v_m;
   vec4 biome_color = texture2D(u_colormap, em);
   vec4 water_color = texture2D(u_water, pos);
   if (em.x < 0.5) { water_color.a = 0.0; } // don't draw rivers in the ocean

   float depth0 = texture2D(u_depth, v_pos).x,
         depth1 = max(max(texture2D(u_depth, v_pos + u_outline_depth*(-dy-dx)).x,
                          texture2D(u_depth, v_pos + u_outline_depth*(-dy+dx)).x),
                          texture2D(u_depth, v_pos + u_outline_depth*(-dy)).x);
   float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, depth1-depth0) - u_outline_threshold);

   // gl_FragColor = vec4(light/outline, light/outline, light/outline, 1);
   // gl_FragColor = texture2D(u_mapdata, v_uv);
   // gl_FragColor = vec4(mix(vec4(1,1,1,1), water_color, u_mix * sqrt(water_color.a)).rgb, 1);
   gl_FragColor = vec4(mix(biome_color, water_color, u_mix * water_color.a).rgb * light / outline, 1);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_xy;
attribute vec2 a_em;
attribute float a_w;
varying vec2 v_uv, v_pos;
varying float v_m;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, pow(max(0.0, a_em.x), u_exponent), 1));
    v_uv = a_xy / 1000.0;
    v_m = a_em.y;
    v_pos = (1.0 + pos.xy) * 0.5;
    gl_Position = pos;
}`,

    elements: regl.prop('elements'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_em: regl.prop('a_em'),
    },
    uniforms: {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
        u_depth: regl.prop('u_depth'),
        u_colormap: regl.texture({width: colormap.width, height: colormap.height, data: colormap.data, wrapS: 'clamp', wrapT: 'clamp'}),
        u_mapdata: () => fbo_em_texture,
        u_water: regl.prop('u_water'),
        u_inverse_texture_size: 1.5 / fbo_texture_size,
        u_light_angle: () => [
            Math.cos(Math.PI/180 * (param.drape.light_angle_deg + param.drape.rotate_z_deg)),
            Math.sin(Math.PI/180 * (param.drape.light_angle_deg + param.drape.rotate_z_deg)),
        ],
        u_slope: () => param.drape.slope,
        u_flat: () => param.drape.flat,
        u_c: () => param.drape.c,
        u_d: () => param.drape.d,
        u_mix: () => param.drape.mix,
        u_outline_depth: () => param.drape.outline_depth,
        u_outline_strength: () => param.drape.outline_strength,
        u_outline_threshold: () => param.drape.outline_threshold/1000,
    },
});

let redraw, renderer;
exports.setup = function(mesh) {
    console.time('make-mesh-static');
    renderer = new Renderer(mesh);
    console.timeEnd('make-mesh-static');
};

exports.draw = function(map, water_bitmap, spacing) {
    let FRAME = 0, T1 = console.time, T2 = console.timeEnd;

    let topdown = mat4.create();
    mat4.translate(topdown, topdown, [-1, -1, 0, 0]);
    mat4.scale(topdown, topdown, [1/500, 1/500, 1, 1]);

    T1('make-mesh-dynamic-land');
    renderer.updateLand(map);
    T2('make-mesh-dynamic-land');
    T1('make-mesh-dynamic-water');
    renderer.updateWater(map, spacing);
    T2('make-mesh-dynamic-water');
    
    T1('make-water-texture');
    let u_water = water_bitmap ? regl.texture({data: water_bitmap, wrapS: 'clamp', wrapT: 'clamp'}) : fbo_river_texture;
    T2('make-water-texture');
    
    redraw = () => {

        T1(`draw-em ${renderer.quad_elements.length/3} triangles`);
        drawElevationMoisture({
            elements: renderer.buffer_quad_elements,
            a_xy: renderer.buffer_quad_xy,
            a_em: renderer.buffer_quad_em,
            a_w: renderer.buffer_quad_w,
            a_flow: renderer.buffer_quad_w,
            u_projection: topdown,
        });
        T2(`draw-em ${renderer.quad_elements.length/3} triangles`);

        T1(`draw-rivers ${renderer.a_river_xy.length/6} triangles`);
        drawRivers({
            count: renderer.a_river_xy.length/2,
            a_xy: renderer.buffer_river_xy,
            a_uv: renderer.buffer_river_uv,
            u_projection: topdown,
        });
        T2(`draw-rivers ${renderer.a_river_xy.length/6} triangles`);
        
        let projection = mat4.create();
        mat4.rotateX(projection, projection, param.drape.rotate_x_deg * Math.PI/180);
        mat4.rotateZ(projection, projection, param.drape.rotate_z_deg * Math.PI/180);
        mat4.scale(projection, projection, [1/param.distance, 1/param.distance, param.drape.scale_z, 1]);
        mat4.translate(projection, projection, [-param.x, -param.y, 0, 0]);
        
        T1('draw-depth');
        if (param.drape.outline_depth > 0) {
            drawDepth({
                elements: renderer.buffer_quad_elements,
                a_xy: renderer.buffer_quad_xy,
                a_em: renderer.buffer_quad_em,
                u_projection: projection
            });
        }
        T2('draw-depth');
        
        T1('draw-drape');
        regl.clear({color: [0, 0, 0, 1], depth: 1});
        drawDrape({
            elements: renderer.buffer_quad_elements,
            a_xy: renderer.buffer_quad_xy,
            a_em: renderer.buffer_quad_em,
            a_w: renderer.buffer_quad_w,
            u_water: u_water,
            u_depth: fbo_depth_texture,
            u_projection: projection
        });
        T2('draw-drape');

        T1('clear-fb');
        // Might as well do these afterwards, because they're a
        // significant slowdown, and I should do it after I've already
        // drawn the map
        //regl({framebuffer: fbo_em})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
        regl({framebuffer: fbo_z})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
        // TODO: do I even need to clear them?
        T2('clear-fb');
        
        if (FRAME++ > 2) {
            T1 = T2 = () => {}; // only show performance the first few times
        }
    };
    redraw();
};


let G = new dat.GUI();
G.add(param, 'exponent', 1, 10);
G.add(param, 'distance', 100, 1000);
G.add(param, 'x', 0, 1000);
G.add(param, 'y', 0, 1000);
G.add(param.drape, 'light_angle_deg', 0, 360);
G.add(param.drape, 'slope', 0, 10);
G.add(param.drape, 'flat', 0, 10);
G.add(param.drape, 'c', 0, 1);
G.add(param.drape, 'd', 0, 40);
G.add(param.drape, 'mix', 0, 2);
G.add(param.drape, 'rotate_x_deg', -360, 360);
G.add(param.drape, 'rotate_z_deg', -360, 360);
G.add(param.drape, 'scale_z', 0, 2);
G.add(param.drape, 'outline_depth', 0, 5);
G.add(param.drape, 'outline_strength', 0, 30);
G.add(param.drape, 'outline_threshold', 0, 100);
function update() {
    redraw();
}
for (let c of G.__controllers) c.listen().onChange(update);
exports.datGUI = G;
