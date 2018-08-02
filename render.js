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
    extensions: ['OES_element_index_uint']
});

const param = {
    exponent: 4.0,
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

class Renderer {
    constructor (mesh) {
        this.a_position = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.elements = new Int32Array(3 * mesh.numSolidSides);
        
        Geometry.setMeshGeometry(mesh, this.a_position);
        
        this.buffer_position = regl.buffer({
            usage: 'static',
            type: 'float',
            data: this.a_position,
        });

        this.buffer_em = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_em.length,
        });

        this.buffer_elements = regl.elements({
            primitive: 'triangles',
            usage: 'dynamic',
            type: 'uint32',
            length: 4 * this.elements.length,
            count: this.elements.length,
        });
    }

    /* Update the buffers with the latest em, elements data */
    update() {
        // TODO: better to use subdata or reinitialize?
        this.buffer_em.subdata(this.a_em);
        this.buffer_elements.subdata(this.elements);
    }
}


/* write 16-bit elevation and 8-bit moisture to a texture */
let drawElevationMoisture = regl({
    frag: `
precision mediump float;
varying vec2 v_position;
varying vec2 v_em;
void main() {
   float e = 0.5 * (1.0 + v_em.x);
   if (e < 0.5) { e -= 0.005; } // produces the border
   gl_FragColor = vec4(fract(256.0*e), e, v_em.y, 1);
}`, // TODO: < 0.5 vs <= 0.5 produce significantly different results

    vert: `
precision mediump float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_position;
attribute vec2 a_em;
varying vec2 v_position;
varying vec2 v_em;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, 0, 1));
    v_position = 0.5 * (1.0 + pos.xy);
    v_em = vec2(a_em.x < 0.0? a_em.x : pow(a_em.x, u_exponent), a_em.y);
    gl_Position = pos;
}`,

    uniforms:  {
        u_exponent: () => param.exponent,
        u_projection: regl.prop('u_projection'),
        u_water: regl.prop('u_water'),
    },

    framebuffer: fbo_em,
    elements: regl.prop('elements'),
    attributes: {
        a_position: regl.prop('a_position'),
        a_em: regl.prop('a_em'),
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
attribute vec2 a_em;
varying float v_z;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, pow(max(0.0, a_em.x), u_exponent), 1));
    v_z = a_em.x;
    gl_Position = pos;
}`,

    framebuffer: fbo_z,
    elements: regl.prop('elements'),
    attributes: {
        a_position: regl.prop('a_position'),
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
precision mediump float;
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
   vec4 biome_color = texture2D(u_colormap, em);
   vec4 water_color = texture2D(u_water, pos);

   float depth0 = texture2D(u_depth, v_pos + sample_offset).x,
         depth1 = max(texture2D(u_depth, v_pos + sample_offset + u_outline_depth*(-dy+dx)).x,
                      texture2D(u_depth, v_pos + sample_offset + u_outline_depth*(-dy-dx)).x);
   float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, depth1-depth0) - u_outline_threshold);

   // gl_FragColor = vec4(light/outline, light/outline, light/outline, 1);
   // gl_FragColor = vec4(biome_color, 1);
   // gl_FragColor = texture2D(u_mapdata, v_uv);
   gl_FragColor = vec4(mix(biome_color, water_color, u_mix * sqrt(water_color.a)).rgb * light / outline, 1);
}`,

    vert: `
precision mediump float;
uniform mat4 u_projection;
uniform float u_exponent;
attribute vec2 a_position;
attribute vec2 a_em;
varying vec2 v_uv, v_pos;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_position, pow(max(0.0, a_em.x), u_exponent), 1));
    v_uv = vec2(a_position.x / 1000.0, a_position.y / 1000.0);
    v_pos = (1.0 + pos.xy) * 0.5;
    gl_Position = pos;
}`,

    elements: regl.prop('elements'),
    attributes: {
        a_position: regl.prop('a_position'),
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
            Math.cos(Math.PI/180 * param.drape.light_angle_deg),
            Math.sin(Math.PI/180 * param.drape.light_angle_deg),
        ],
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

    T1('make-mesh-static');
    let renderer = new Renderer(map.mesh);
    T2('make-mesh-static');
    T1('make-mesh-dynamic');
    Geometry.setMapGeometry(map, renderer.elements, renderer.a_em);
    renderer.update();
    T2('make-mesh-dynamic');
    
    T1('make-water-texture');
    let u_water = regl.texture({data: water_bitmap, wrapS: 'clamp', wrapT: 'clamp'});
    T2('make-water-texture');
    
    redraw = () => {

        T1(`draw-em ${renderer.elements.length/3} triangles`);
        // Use regl scopes to bind regl.clear to the framebuffer to clear it
        drawElevationMoisture({
            elements: renderer.buffer_elements,
            a_position: renderer.buffer_position,
            a_em: renderer.buffer_em,
            u_projection: topdown,
        });
        T2(`draw-em ${renderer.elements.length/3} triangles`);

        let projection = mat4.create();
        mat4.rotateX(projection, projection, param.drape.rotate_x);
        mat4.rotateZ(projection, projection, param.drape.rotate_z);
        mat4.translate(projection, projection, [-1, -1, 0, 0]);
        mat4.scale(projection, projection, [1/500, 1/500, param.drape.scale_z, 1]);
        
        T1('draw-depth');
        if (param.drape.outline_depth > 0) {
            drawDepth({
                elements: renderer.buffer_elements,
                a_position: renderer.buffer_position,
                a_em: renderer.buffer_em,
                u_water: u_water,
                u_projection: projection
            });
        }
        T2('draw-depth');
        
        T1('draw-drape');
        regl.clear({color: [0, 0, 0, 1], depth: 1});
        drawDrape({
            elements: renderer.buffer_elements,
            a_position: renderer.buffer_position,
            a_em: renderer.buffer_em,
            u_water: u_water,
            u_depth: fbo_z_texture,
            u_projection: projection
        });
        T2('draw-drape');

        T1('clear-fb');
        // Might as well do these afterwards, because they're a
        // significant slowdown, and I should do it after I've already
        // drawn the map
        regl({framebuffer: fbo_em})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
        regl({framebuffer: fbo_z})(() => { regl.clear({color: [0, 0, 0, 1], depth: 1}); });
        T2('clear-fb');
        
        if (FRAME++ > 2) {
            T1 = T2 = () => {}; // only show performance the first few times
        }
    };
    redraw();
};


let G = new dat.GUI();
G.add(param, 'exponent', 1, 10);
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
