/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl+regl to render the generated maps
 */

'use strict';

const {vec3, vec4, mat4} = require('gl-matrix');
const colormap = require('./colormap');
const Geometry = require('./geometry');
const regl = require('regl')({
    canvas: "#mapgen4",
    extensions: ['OES_element_index_uint']
});


const river_texturemap = regl.texture({data: Geometry.createRiverBitmap(), mipmap: 'nice', min: 'mipmap', mag: 'linear', premultiplyAlpha: true});
const fbo_texture_size = 2048;
const fbo_land_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_land = regl.framebuffer({color: [fbo_land_texture]});
const fbo_depth_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: [fbo_depth_texture]});
const fbo_river_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_river = regl.framebuffer({color: [fbo_river_texture]});
const fbo_final_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size, min: 'linear', mag: 'linear'});
const fbo_final = regl.framebuffer({color: [fbo_final_texture]});


/* draw rivers to a texture, which will be draped on the map surface */
const drawRivers = regl({
    frag: `
precision mediump float;
uniform sampler2D u_rivertexturemap;
varying vec2 v_uv;
const vec3 blue = vec3(0.2, 0.5, 0.7);
void main() {
   vec4 color = texture2D(u_rivertexturemap, v_uv);
   gl_FragColor = vec4(blue * color.a, color.a);
   // gl_FragColor = color;
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
        func: {src:'one', dst:'one minus src alpha'},
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
const drawLand = regl({
    frag: `
precision highp float;
varying float v_e;
void main() {
   float e = 0.5 * (1.0 + v_e);
   // TODO: param:
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
const drawDepth = regl({
    frag: `
precision highp float;
varying float v_z;
void main() {
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
const drawDrape = regl({
    frag: `
precision highp float;
uniform sampler2D u_colormap;
uniform sampler2D u_mapdata;
uniform sampler2D u_water;
uniform sampler2D u_depth;
uniform vec2 u_light_angle;
uniform float u_inverse_texture_size, 
              u_slope, u_flat,
              u_c, u_d,
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

   // gl_FragColor = vec4(0.9*light/outline, 0.8*light/outline, 0.7*light/outline, 1);
   // gl_FragColor = vec4(vec3(0.1+0.8*em.x, sqrt(em.x)-0.2, 0.8-0.9*em.x) * light / outline, 1);
   gl_FragColor = vec4(mix(biome_color, water_color, water_color.a).rgb * light / outline, 1);
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

    framebuffer: fbo_final,
    elements: regl.prop('elements'),
    attributes: {
        a_xy: regl.prop('a_xy'),
        a_em: regl.prop('a_em'),
    },
    uniforms: {
        u_projection: regl.prop('u_projection'),
        u_depth: regl.prop('u_depth'),
        u_colormap: regl.texture({width: colormap.width, height: colormap.height, data: colormap.data, wrapS: 'clamp', wrapT: 'clamp'}),
        u_mapdata: () => fbo_land_texture,
        u_water: regl.prop('u_water'),
        u_inverse_texture_size: 1.5 / fbo_texture_size,
        u_light_angle: regl.prop('u_light_angle'),
        u_slope: regl.prop('u_slope'),
        u_flat: regl.prop('u_flat'),
        u_c: regl.prop('u_c'),
        u_d: regl.prop('u_d'),
        u_outline_depth: regl.prop('u_outline_depth'),
        u_outline_strength: regl.prop('u_outline_strength'),
        u_outline_threshold: regl.prop('u_outline_threshold'),
    },
});


/* draw the high resolution final output to the screen, smoothed and resized */
const drawFinal = regl({
    frag: `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_texture_size;
varying vec2 v_uv;
const vec2 half_pixel_offset = vec2(0.5, 0.5); // for smoothing
void main() {
   gl_FragColor = texture2D(u_texture, v_uv + half_pixel_offset / u_texture_size);
}`,

    vert: `
precision highp float;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(2.0 * v_uv - 1.0, 0.0, 1.0);
}`,
    
    uniforms:  {
        u_texture: fbo_final_texture,
        u_texture_size: fbo_texture_size,
    },
    depth: {
        enable: false,
    },
    count: 3,
    attributes: {
        a_uv: [-2, 0, 0, -2, 2, 2]
    },
});



class Renderer {
    constructor (mesh) {
        this.resizeCanvas();
        
        this.topdown = mat4.create();
        mat4.translate(this.topdown, this.topdown, [-1, -1, 0, 0]);
        mat4.scale(this.topdown, this.topdown, [1/500, 1/500, 1, 1]);

        this.projection = mat4.create();
        this.inverse_projection = mat4.create();
        
        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.quad_elements = new Int32Array(3 * mesh.numSolidSides);
        /* NOTE: The maximum number of river triangles will be when
         * there's a single binary tree that has every node filled.
         * Each of the N/2 leaves will produce 1 output triangle and
         * each of the N/2 nodes will produce 2 triangles. On average
         * there will be 1.5 output triangles per input triangle. */
        this.a_river_xyuv = new Float32Array(1.5 * 3 * 4 * mesh.numSolidTriangles);
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

        this.renderParam = undefined;
        this.startDrawingLoop();
    }

    /**
     * @param {[number, number]} coords - screen coordinates 0 ≤ x ≤ 1, 0 ≤ y ≤ 1
     * @returns {[number, number]} - world coords 0 ≤ x ≤ 1000, 0 ≤ y ≤ 1000 
     */
    screenToWorld(coords) {
        /* convert from screen 2d (inverted y) to 4d for matrix multiply */
        let glCoords = vec4.fromValues(
            coords[0] * 2 - 1,
            1 - coords[1] * 2,
            /* TODO: z should be 0 only when tilt_deg is 0;
             * need to figure out the proper z value here */
            0,
            1
        );
        /* it returns vec4 but we only need vec2; they're compatible */
        return vec4.transformMat4([], glCoords, this.inverse_projection);
    }
    
    /* Update the buffers with the latest map data */
    updateMap() {
        this.buffer_quad_em.subdata(this.a_quad_em);
        this.buffer_quad_elements.subdata(this.quad_elements);
        this.buffer_river_xyuv.subdata(this.a_river_xyuv.subarray(0, 4 * 3 * this.numRiverTriangles));
    }

    /* Allow drawing at a different resolution than the internal texture size */
    resizeCanvas() {
        let canvas = /** @type{HTMLCanvasElement} */(document.getElementById('mapgen4'));
        let size = canvas.clientWidth;
        size = 2048; /* could be smaller to increase performance */
        if (canvas.width !== size || canvas.height !== size) {
            console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${size}x${size}`);
            canvas.width = canvas.height = size;
            regl.poll();
        }
    }

    startDrawingLoop() {
        /* Only draw when render parameters have been passed in;
         * otherwise skip the render and wait for the next tick */
        regl.frame(context => {
            const renderParam = this.renderParam;
            if (!renderParam) { return; }
            this.renderParam = undefined;

            drawLand({
                elements: this.buffer_quad_elements,
                a_xy: this.buffer_quad_xy,
                a_em: this.buffer_quad_em,
                u_projection: this.topdown,
            });

            if (this.numRiverTriangles > 0) {
                drawRivers({
                    count: 3 * this.numRiverTriangles,
                    a_xyuv: this.buffer_river_xyuv,
                    u_projection: this.topdown,
                });
            }
            
            /* Standard rotation for orthographic view */
            mat4.identity(this.projection);
            mat4.rotateX(this.projection, this.projection, (180 + renderParam.tilt_deg) * Math.PI/180);
            mat4.rotateZ(this.projection, this.projection, renderParam.rotate_deg * Math.PI/180);
            
            /* Top-down oblique copies column 2 (y input) to row 3 (z
             * output). Typical matrix libraries such as glm's mat4 or
             * Unity's Matrix4x4 or Unreal's FMatrix don't have this
             * this.projection built-in. For mapgen4 I merge orthographic
             * (which will *move* part of y-input to z-output) and
             * top-down oblique (which will *copy* y-input to z-output).
             * <https://en.wikipedia.org/wiki/Oblique_projection> */
            this.projection[9] = 1;
            
            /* Scale and translate works on the hybrid this.projection */
            mat4.scale(this.projection, this.projection, [1/renderParam.distance, 1/renderParam.distance, renderParam.mountain_height/renderParam.distance, 1]);
            mat4.translate(this.projection, this.projection, [-renderParam.x, -renderParam.y, 0, 0]);

            /* Keep track of the inverse matrix for mapping mouse to world coordinates */
            mat4.invert(this.inverse_projection, this.projection);

            if (renderParam.outline_depth > 0) {
                drawDepth({
                    elements: this.buffer_quad_elements,
                    a_xy: this.buffer_quad_xy,
                    a_em: this.buffer_quad_em,
                    u_projection: this.projection
                });
            }
            
            drawDrape({
                elements: this.buffer_quad_elements,
                a_xy: this.buffer_quad_xy,
                a_em: this.buffer_quad_em,
                u_water: fbo_river_texture,
                u_depth: fbo_depth_texture,
                u_projection: this.projection,
                u_light_angle: [
                    Math.cos(Math.PI/180 * (renderParam.light_angle_deg + renderParam.rotate_deg)),
                    Math.sin(Math.PI/180 * (renderParam.light_angle_deg + renderParam.rotate_deg)),
                ],
                u_slope: renderParam.slope,
                u_flat: renderParam.flat,
                u_c: renderParam.c,
                u_d: renderParam.d,
                u_outline_depth: renderParam.outline_depth * 500 / renderParam.distance,
                u_outline_strength: renderParam.outline_strength,
                u_outline_threshold: renderParam.outline_threshold / 1000,
            });

            drawFinal();
            
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
            fbo_final.use(() => {
                regl.clear({color: [0.2, 0.3, 0.5, 1], depth: 1});
            });
        });
    }
    

    updateView(renderParam) {
        this.renderParam = renderParam;
    }
}

exports.Renderer = Renderer;
