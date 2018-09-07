/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl+regl to render the generated maps
 */

'use strict';

const {vec3, mat4} = require('gl-matrix');
const colormap = require('./colormap');
const Geometry = require('./geometry');
const regl = require('regl')({
    canvas: "#mapgen4",
    extensions: ['OES_element_index_uint']
});

const param = {
    distance: 480,
    x: 500,
    y: 500,
    drape: {
        light_angle_deg: 80,
        slope: 2,
        flat: 2.5,
        c: 0.25,
        d: 30,
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
const fbo_land_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_land = regl.framebuffer({color: [fbo_land_texture]});
const fbo_depth_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: [fbo_depth_texture]});
const fbo_river_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_river = regl.framebuffer({color: [fbo_river_texture]});


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
attribute vec4 a_xyuv;
varying vec2 v_uv;
void main() {
  v_uv = a_xyuv.ba;
  gl_Position = vec4(u_projection * vec4(a_xyuv.xy, 0, 1));
}`,
    
    uniforms:  {
        u_projection: regl.prop('u_projection'),
        u_rivertexturemap: river_texturemap,
    },

    framebuffer: fbo_river,
    blend: {
        enable: true,
        func: {src:'src alpha', dst:'one minus src alpha'},
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
    color: [0, 0, 0, 0]
    },
    depth: {
        enable: false,
    },
    count: regl.prop('count'),
    attributes: {
        a_xyuv: regl.prop('a_xyuv'),
    },
});


/* write 16-bit elevation to a texture's G,R channels; the B,A channels are empty */
let drawLand = regl({
    frag: `
precision highp float;
varying float v_e;
void main() {
   float e = 0.5 * (1.0 + v_e);
   if (e < 0.5) { e -= 0.005; } // produces the border
   gl_FragColor = vec4(fract(256.0*e), e, 0, 1);
   // NOTE: it should be using the floor instead of rounding, but
   // rounding produces a nice looking artifact, so I'll keep that
   // until I can produce the artifact properly (e.g. bug → feature).
   // Using linear filtering on the texture also smooths out the artifacts.
   //  gl_FragColor = vec4(fract(256.0*e), floor(256.0*e)/256.0, 0, 1);
}`, // TODO: < 0.5 vs <= 0.5 produce significantly different results

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em; // NOTE: moisture channel unused
varying float v_e;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, 0, 1));
    v_e = a_em.x;
    gl_Position = pos;
}`,

    uniforms:  {
        u_projection: regl.prop('u_projection'),
    },

    framebuffer: fbo_land,
    depth: {
        enable: false,
    },
    elements: regl.prop('elements'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_em: regl.prop('a_em'),
    },
});


/* using the same perspective as the final output, write the depth
   to a texture, G,R channels; used for outline shader */
let drawDepth = regl({
    frag: `
precision highp float;
varying float v_z;
void main() {
   // TODO: add precision like I do to elevation
   gl_FragColor = vec4(fract(256.0*v_z), floor(256.0*v_z)/256.0, 0, 1);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em;
varying float v_z;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, max(0.0, a_em.x), 1));
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
        u_projection: regl.prop('u_projection'),
    },
});


/* draw the final image by draping the biome colors over the geometry;
   note that u_depth and u_mapdata are both encoded with G,R channels
   for 16 bits */
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
varying vec2 v_uv, v_pos, v_em;

const vec2 _decipher = vec2(1.0/256.0, 1);
float decipher(vec4 v) {
   return dot(_decipher, v.xy);
}

void main() {
   vec2 sample_offset = vec2(0.5*u_inverse_texture_size, 0.5*u_inverse_texture_size);
   vec2 pos = v_uv + sample_offset;
   vec2 dx = vec2(u_inverse_texture_size, 0),
        dy = vec2(0, u_inverse_texture_size);

   float zE = decipher(texture2D(u_mapdata, pos + dx));
   float zN = decipher(texture2D(u_mapdata, pos - dy));
   float zW = decipher(texture2D(u_mapdata, pos - dx));
   float zS = decipher(texture2D(u_mapdata, pos + dy));
   vec3 slope_vector = normalize(vec3(zS-zN, zE-zW, u_d*2.0*u_inverse_texture_size));
   vec3 light_vector = normalize(vec3(u_light_angle, mix(u_slope, u_flat, slope_vector.z)));
   float light = u_c + max(0.0, dot(light_vector, slope_vector));
   vec2 em = texture2D(u_mapdata, pos).yz;
   if (em.x > 0.7) { em.x = 2.0 * (em.x-0.7) + 0.7; } /* HACK: for noise-based elevation */
   // if (em.x >= 0.5 && em.y > 0.5) { em.x = 0.49; }
   em.y = v_em.y;
   vec4 biome_color = texture2D(u_colormap, em);
   vec4 water_color = texture2D(u_water, pos);
   if (em.x < 0.5) { water_color.a = 0.0; } // don't draw rivers in the ocean
   // if (fract(v_e * 10.0) < 10.0 * fwidth(v_e)) { biome_color = vec4(0,0,0,1); } // contour lines

   float depth0 = decipher(texture2D(u_depth, v_pos)),
         depth1 = max(max(decipher(texture2D(u_depth, v_pos + u_outline_depth*(-dy-dx))),
                          decipher(texture2D(u_depth, v_pos + u_outline_depth*(-dy+dx)))),
                      decipher(texture2D(u_depth, v_pos + u_outline_depth*(-dy))));
   float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, depth1-depth0) - u_outline_threshold);

   // gl_FragColor = vec4(light/outline, light/outline, light/outline, 1);
   // gl_FragColor = texture2D(u_mapdata, v_uv);
   // gl_FragColor = vec4(mix(vec4(1,1,1,1), water_color, u_mix * sqrt(water_color.a)).rgb, 1);
   gl_FragColor = vec4(mix(biome_color, water_color, u_mix * water_color.a).rgb * light / outline, 1);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em;
varying vec2 v_em, v_uv, v_pos;
varying float v_e, v_m;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, max(0.0, a_em.x), 1));
    v_uv = a_xy / 1000.0;
    v_em = a_em;
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
        u_mapdata: () => fbo_land_texture,
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


class Renderer {
    constructor (mesh) {
        this.frame_number = 0;
        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.quad_elements = new Int32Array(3 * mesh.numSolidSides);
        this.a_river_xyuv = new Float32Array(3 * 4 * mesh.numSolidTriangles);
        this.numRiverTriangles = 0;
        
        Geometry.setMeshGeometry(mesh, this.a_quad_xy);
        
        this.buffer_quad_xy = regl.buffer({
            usage: 'static',
            type: 'float',
            data: this.a_quad_xy,
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

        this.buffer_river_xyuv = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_river_xyuv.length,
        });
    }

    time(label) { console.time(label); }
    timeEnd(label) { console.timeEnd(label); }
    
    /* Update the buffers with the latest map data */
    updateMap() {
        this.time('copy-mesh');
        this.buffer_quad_em.subdata(this.a_quad_em);
        this.buffer_quad_elements.subdata(this.quad_elements);
        this.buffer_river_xyuv.subdata(this.a_river_xyuv.subarray(0, 4 * 3 * this.numRiverTriangles));
        this.timeEnd('copy-mesh');
    }

    updateView() {
        let topdown = mat4.create();
        mat4.translate(topdown, topdown, [-1, -1, 0, 0]);
        mat4.scale(topdown, topdown, [1/500, 1/500, 1, 1]);

        this.time(`draw-land ${this.quad_elements.length/3} triangles`);
        drawLand({
            elements: this.buffer_quad_elements,
            a_xy: this.buffer_quad_xy,
            a_em: this.buffer_quad_em,
            u_projection: topdown,
        });
        this.timeEnd(`draw-land ${this.quad_elements.length/3} triangles`);

        this.time(`draw-rivers ${this.a_river_xyuv.length/12} triangles`);
        drawRivers({
            count: this.a_river_xyuv.length/4,
            a_xyuv: this.buffer_river_xyuv,
            u_projection: topdown,
        });
        this.timeEnd(`draw-rivers ${this.a_river_xyuv.length/12} triangles`);
        
        let projection = mat4.create();
        mat4.rotateX(projection, projection, param.drape.rotate_x_deg * Math.PI/180);
        mat4.rotateZ(projection, projection, param.drape.rotate_z_deg * Math.PI/180);
        mat4.scale(projection, projection, [1/param.distance, 1/param.distance, param.drape.scale_z, 1]);
        mat4.translate(projection, projection, [-param.x, -param.y, 0, 0]);
        
        this.time('draw-depth');
        if (param.drape.outline_depth > 0) {
            drawDepth({
                elements: this.buffer_quad_elements,
                a_xy: this.buffer_quad_xy,
                a_em: this.buffer_quad_em,
                u_projection: projection
            });
        }
        this.timeEnd('draw-depth');
        
        this.time('draw-drape');
        regl.clear({color: [0, 0, 0, 1], depth: 1});
        drawDrape({
            elements: this.buffer_quad_elements,
            a_xy: this.buffer_quad_xy,
            a_em: this.buffer_quad_em,
            u_water: fbo_river_texture,
            u_depth: fbo_depth_texture,
            u_projection: projection
        });
        this.timeEnd('draw-drape');

        this.time('clear-fb');
        // I don't have to clear fbo_em because it doesn't have depth
        // and will be redrawn every frame. I do have to clear
        // fbo_river because even though it doesn't have depth, it
        // doesn't draw all triangles.
        fbo_river.use(() => {
            regl.clear({color: [0, 0, 0, 0]});
        });
        fbo_z.use(() => {
            regl.clear({color: [0, 0, 0, 1], depth: 1});
        });
        this.timeEnd('clear-fb');

        if (this.frame_number++ > 2) {
            this.time = this.timeEnd = () => {}; // only show performance the first few times
        }
    }
}

Renderer.param = param;
exports.Renderer = Renderer;
