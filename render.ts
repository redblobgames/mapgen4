/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl+regl to render the generated maps
 */

import {vec2, vec4, mat4} from 'gl-matrix';
import colormap from "./colormap.ts";
import Geometry from "./geometry.ts";
import type {Mesh} from "./types.d.ts";

import REGL from 'regl/dist/regl.min.js';
// NOTE: the typescript definition for regl.prop so cumbersome I don't use it
const regl = REGL({
    canvas: "#mapgen4",
    extensions: ['OES_element_index_uint']
});


const river_texturemap = regl.texture({data: Geometry.createRiverBitmap(), mipmap: 'nice', min: 'mipmap', mag: 'linear', premultiplyAlpha: true});
const fbo_texture_size = 2048;
const fbo_land_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_land = regl.framebuffer({color: fbo_land_texture});
const fbo_depth_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: fbo_depth_texture});
const fbo_river_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_river = regl.framebuffer({color: fbo_river_texture});
const fbo_final_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size, min: 'linear', mag: 'linear'});
const fbo_final = regl.framebuffer({color: fbo_final_texture});


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
uniform sampler2D u_water;
uniform float u_outline_water;
varying float v_e;
varying vec2 v_xy;
void main() {
   float e = 0.5 * (1.0 + v_e);
   float river = texture2D(u_water, v_xy).a;
   if (e >= 0.5) {
      float bump = u_outline_water / 256.0;
      float L1 = e + bump;
      float L2 = (e - 0.5) * (bump * 100.0) + 0.5;
      // TODO: simplify equation
      e = min(L1, mix(L1, L2, river));
   }
   gl_FragColor = vec4(fract(256.0*e), e, 0, 1);
   // NOTE: it should be using the floor instead of rounding, but
   // rounding produces a nice looking artifact, so I'll keep that
   // until I can produce the artifact properly (e.g. bug → feature).
   // Using linear filtering on the texture also smooths out the artifacts.
   //  gl_FragColor = vec4(fract(256.0*e), floor(256.0*e)/256.0, 0, 1);
   // NOTE: need to use GL_NEAREST filtering for this texture because
   // blending R,G channels independently isn't going to give the right answer
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em; // NOTE: moisture channel unused
varying float v_e;
varying vec2 v_xy;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy, 0, 1));
    v_xy = (1.0 + pos.xy) * 0.5;
    v_e = a_em.x;
    gl_Position = pos;
}`,

    uniforms:  {
        u_projection: regl.prop('u_projection'),
        u_water: regl.prop('u_water'),
        u_outline_water: regl.prop('u_outline_water'),
        u_m: regl.prop('u_m'),
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
              u_ambient, u_overhead,
              u_outline_strength, u_outline_coast, u_outline_water,
              u_outline_depth, u_outline_threshold,
              u_biome_colors;
varying vec2 v_uv, v_xy, v_em;
varying float v_z;

const vec2 _decipher = vec2(1.0/256.0, 1);
float decipher(vec4 v) {
   return dot(_decipher, v.xy);
}

const vec3 neutral_land_biome = vec3(0.9, 0.8, 0.7);
const vec3 neutral_water_biome = 0.8 * neutral_land_biome;

void main() {
   vec2 sample_offset = vec2(0.5*u_inverse_texture_size, 0.5*u_inverse_texture_size);
   vec2 pos = v_uv + sample_offset;
   vec2 dx = vec2(u_inverse_texture_size, 0),
        dy = vec2(0, u_inverse_texture_size);

   float zE = decipher(texture2D(u_mapdata, pos + dx));
   float zN = decipher(texture2D(u_mapdata, pos - dy));
   float zW = decipher(texture2D(u_mapdata, pos - dx));
   float zS = decipher(texture2D(u_mapdata, pos + dy));
   vec3 slope_vector = normalize(vec3(zS-zN, zE-zW, u_overhead*2.0*u_inverse_texture_size));
   vec3 light_vector = normalize(vec3(u_light_angle, mix(u_slope, u_flat, slope_vector.z)));
   float light = u_ambient + max(0.0, dot(light_vector, slope_vector));
   vec2 em = texture2D(u_mapdata, pos).yz;
   em.y = v_em.y;
   vec3 neutral_biome_color = neutral_land_biome;
   vec4 water_color = texture2D(u_water, pos);
   if (em.x >= 0.5 && v_z >= 0.0) {
     // on land, lower the elevation around rivers
     em.x -= u_outline_water / 256.0 * (1.0 - water_color.a); 
   } else {
     // in the ocean, or underground, don't draw rivers
     water_color.a = 0.0; neutral_biome_color = neutral_water_biome; 
   }
   vec3 biome_color = texture2D(u_colormap, em).rgb;
   water_color = mix(vec4(neutral_water_biome * (1.2 - water_color.a), water_color.a), water_color, u_biome_colors);
   biome_color = mix(neutral_biome_color, biome_color, u_biome_colors);
   if (v_z < 0.0) {
      // at the exterior boundary, we'll draw soil or water underground
      float land_or_water = smoothstep(0.0, -0.001, v_em.x - v_z);
      vec3 soil_color = vec3(0.4, 0.3, 0.2);
      vec3 underground_color = mix(soil_color, mix(neutral_water_biome, vec3(0.1, 0.1, 0.2), u_biome_colors), land_or_water) * smoothstep(-0.7, -0.1, v_z);
      vec3 highlight_color = mix(vec3(0, 0, 0), mix(vec3(0.8, 0.8, 0.8), vec3(0.4, 0.5, 0.7), u_biome_colors), land_or_water);
      biome_color = mix(underground_color, highlight_color, 0.5 * smoothstep(-0.025, 0.0, v_z));
      light = 1.0 - 0.3 * smoothstep(0.8, 1.0, fract((v_em.x - v_z) * 20.0)); // add horizontal lines
   }
   // if (fract(em.x * 10.0) < 10.0 * fwidth(em.x)) { biome_color = vec3(0,0,0); } // contour lines

   // TODO: add noise texture based on biome

   // TODO: once I remove the elevation rounding artifact I can simplify
   // this by taking the max first and then deciphering
   float depth0 = decipher(texture2D(u_depth, v_xy)),
         depth1 = max(max(decipher(texture2D(u_depth, v_xy + u_outline_depth*(-dy-dx))),
                          decipher(texture2D(u_depth, v_xy + u_outline_depth*(-dy+dx)))),
                      decipher(texture2D(u_depth, v_xy + u_outline_depth*(-dy)))),
         depth2 = max(max(decipher(texture2D(u_depth, v_xy + u_outline_depth*(dy-dx))),
                          decipher(texture2D(u_depth, v_xy + u_outline_depth*(dy+dx)))),
                      decipher(texture2D(u_depth, v_xy + u_outline_depth*(dy))));
   float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, depth1-depth0) - u_outline_threshold);

   // Add coast outline, but avoid it if there's a river nearby
   float neighboring_river = max(
       max(
          texture2D(u_water, pos + u_outline_depth * dx).a,
          texture2D(u_water, pos - u_outline_depth * dx).a
       ),
       max(
          texture2D(u_water, pos + u_outline_depth * dy).a,
          texture2D(u_water, pos - u_outline_depth * dy).a
       )
   );
   if (em.x <= 0.5 && max(depth1, depth2) > 1.0/256.0 && neighboring_river <= 0.2) { outline += u_outline_coast * 256.0 * (max(depth1, depth2) - 2.0*(em.x - 0.5)); }

   gl_FragColor = vec4(mix(biome_color, water_color.rgb, water_color.a) * light / outline, 1);
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em;
varying vec2 v_em, v_uv, v_xy;
varying float v_z;
void main() {
    v_em = a_em;
    vec2 xy_clamped = clamp(a_xy, vec2(0, 0), vec2(1000, 1000));
    v_z = max(0.0, a_em.x); // oceans with e<0 still rendered at z=0
    if (xy_clamped != a_xy) { // boundary points
        v_z = -0.5;
        v_em = vec2(0.0, 0.0);
    }
    vec4 pos = vec4(u_projection * vec4(xy_clamped, v_z, 1));
    v_uv = a_xy / 1000.0;
    v_xy = (1.0 + pos.xy) * 0.5;
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
        u_ambient: regl.prop('u_ambient'),
        u_overhead: regl.prop('u_overhead'),
        u_outline_depth: regl.prop('u_outline_depth'),
        u_outline_coast: regl.prop('u_outline_coast'),
        u_outline_water: regl.prop('u_outline_water'),
        u_outline_strength: regl.prop('u_outline_strength'),
        u_outline_threshold: regl.prop('u_outline_threshold'),
        u_biome_colors: regl.prop('u_biome_colors'),
    },
});


/* draw the high resolution final output to the screen, smoothed and resized */
const drawFinal = regl({
    frag: `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_offset;
varying vec2 v_uv;
void main() {
   gl_FragColor = texture2D(u_texture, v_uv + u_offset);
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
        u_offset: regl.prop('u_offset'),
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
    numRiverTriangles: number = 0;
    
    topdown: mat4;
    projection: mat4;
    inverse_projection: mat4;
    
    a_quad_xy: Float32Array;
    a_quad_em: Float32Array;
    quad_elements: Int32Array;
    a_river_xyuv: Float32Array;

    buffer_quad_xy: REGL.Buffer;
    buffer_quad_em: REGL.Buffer;
    buffer_river_xyuv: REGL.Buffer;
    buffer_quad_elements: REGL.Elements;

    screenshotCanvas: HTMLCanvasElement;
    screenshotCallback: () => void;
    renderParam: any;
    
    constructor (mesh: Mesh) {
        this.resizeCanvas();
        
        this.topdown = mat4.create();
        mat4.translate(this.topdown, this.topdown, [-1, -1, 0]);
        mat4.scale(this.topdown, this.topdown, [1/500, 1/500, 1]);

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

        this.screenshotCanvas = document.createElement('canvas');
        this.screenshotCanvas.width = fbo_texture_size;
        this.screenshotCanvas.height = fbo_texture_size;
        this.screenshotCallback = null;
        
        this.renderParam = undefined;
        this.startDrawingLoop();
    }

    screenToWorld(coords: [number, number]): vec2 {
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
        let transformed = vec4.transformMat4(vec4.create(), glCoords, this.inverse_projection);
        return [transformed[0], transformed[1]];
    }
    
    /* Update the buffers with the latest map data */
    updateMap() {
        this.buffer_quad_em.subdata(this.a_quad_em);
        this.buffer_quad_elements.subdata(this.quad_elements);
        this.buffer_river_xyuv.subdata(this.a_river_xyuv.subarray(0, 4 * 3 * this.numRiverTriangles));
    }

    /* Allow drawing at a different resolution than the internal texture size */
    resizeCanvas() {
        let canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        let size = canvas.clientWidth;
        size = 2048; /* could be smaller to increase performance */
        if (canvas.width !== size || canvas.height !== size) {
            console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${size}x${size}`);
            canvas.width = canvas.height = size;
            regl.poll();
        }
    }

    startDrawingLoop() {
        function clearBuffers() {
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
                regl.clear({color: [0.3, 0.3, 0.35, 1], depth: 1});
            });
        }

        /* Only draw when render parameters have been passed in;
         * otherwise skip the render and wait for the next tick */
        clearBuffers();
        regl.frame(_context => {
            const renderParam = this.renderParam;
            if (!renderParam) { return; }
            this.renderParam = undefined;

            if (this.numRiverTriangles > 0) {
                drawRivers({
                    count: 3 * this.numRiverTriangles,
                    a_xyuv: this.buffer_river_xyuv,
                    u_projection: this.topdown,
                });
            }
            
            drawLand({
                elements: this.buffer_quad_elements,
                a_xy: this.buffer_quad_xy,
                a_em: this.buffer_quad_em,
                u_projection: this.topdown,
                u_water: fbo_river_texture,
                u_outline_water: renderParam.outline_water,
            });

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
            mat4.scale(this.projection, this.projection, [renderParam.zoom/100, renderParam.zoom/100, renderParam.mountain_height * renderParam.zoom/100]);
            mat4.translate(this.projection, this.projection, [-renderParam.x, -renderParam.y, 0]);

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
                u_ambient: renderParam.ambient,
                u_overhead: renderParam.overhead,
                u_outline_depth: renderParam.outline_depth * 5 * renderParam.zoom,
                u_outline_coast: renderParam.outline_coast,
                u_outline_water: renderParam.outline_water,
                u_outline_strength: renderParam.outline_strength,
                u_outline_threshold: renderParam.outline_threshold / 1000,
                u_biome_colors: renderParam.biome_colors,
            });

            drawFinal({
                u_offset: [0.5 / fbo_texture_size, 0.5 / fbo_texture_size],
            });

            if (this.screenshotCallback) {
                // TODO: regl says I need to use preserveDrawingBuffer
                const gl = regl._gl;
                const ctx = this.screenshotCanvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, fbo_texture_size, fbo_texture_size);
                const bytesPerRow = 4 * fbo_texture_size;
                const buffer = new Uint8Array(bytesPerRow * fbo_texture_size);
                gl.readPixels(0, 0, fbo_texture_size, fbo_texture_size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

                // Flip row order from WebGL to Canvas
                for (let y = 0; y < fbo_texture_size; y++) {
                    const rowBuffer = new Uint8Array(buffer.buffer, y * bytesPerRow, bytesPerRow);
                    imageData.data.set(rowBuffer, (fbo_texture_size-y-1) * bytesPerRow);
                }
                ctx.putImageData(imageData, 0, 0);

                this.screenshotCallback();
                this.screenshotCallback = null;
            }

            clearBuffers();
        });
    }
    

    updateView(renderParam: any) {
        this.renderParam = renderParam;
    }
}

export default Renderer;
