/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018, 2025 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl to render the generated maps
 */

import {vec2, vec4, mat4} from 'gl-matrix';
import colormap from "./colormap.ts";
import Geometry from "./geometry.ts";
import type {Mesh} from "./types.d.ts";

//////////////////////////////////////////////////////////////////////
// WebGL wrappers

type Buffer = {
    bind(): void;
    vertexAttribPointer(index: GLuint, size: GLint, type: GLenum, normalized: GLboolean, stride: GLsizei, offset: GLintptr): void;
    subdata(offset: number, data: AllowSharedBufferSource): void;
}

type Program = {
    use(): void;
    [name: `a_${string}`]: GLint;
    [name: `u_${string}`]: WebGLUniformLocation;
}

type Texture = {
    id: WebGLTexture;
    width: number;
    height: number;
    bind(): void;
    activate(register: GLint, uniform: WebGLUniformLocation): void;
}

type Framebuffer = {
    id: WebGLFramebuffer;
    texture: Texture | null;
    depth: boolean;
    bind(): void;
    viewport(): void;
    clear(r: number, g: number, b: number, a: number): void;
}

class WebGLWrapper {
    gl: WebGLRenderingContext;

    constructor (canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl') as WebGLRenderingContext;
        if (!this.gl) { alert("This project requires WebGL."); return; }
        canvas.addEventListener('webglcontextlost', () => console.error("This project not handle WebGL context loss"));
        this.gl.getExtension('OES_element_index_uint'); // MDN says this is universally supported
    }

    createBuffer(options: {indices?: boolean, update: 'static' | 'dynamic', data: AllowSharedBufferSource}): Buffer {
        const {gl} = this;
        const target = options.indices ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, options.data, options.update === 'static'? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
        return {
            bind() {
                gl.bindBuffer(target, buffer);
            },
            vertexAttribPointer(index, size, type, normalized, stride, offset) {
                this.bind();
                gl.enableVertexAttribArray(index);
                gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
            },
            subdata(offset: number, data: AllowSharedBufferSource) {
                this.bind();
                gl.bufferSubData(target, offset, data);
            },
        };
    }

    createTexture(options: {width?: number, height?: number, mipmap?: boolean, image?: HTMLCanvasElement, data?: Uint8Array, filter: 'linear'|'nearest'}): Texture {
        const {gl} = this;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        if (options.image) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.image);
        } else if (options.width && options.height) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, options.width, options.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, options.data ?? null);
        } else {
            throw "createTexture needs either an image or a width✕height";
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter === 'linear'? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.filter === 'linear'? gl.LINEAR : gl.NEAREST);
        if (options.mipmap) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter === 'linear'? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
        return {
            id: texture,
            width: options.width ?? options.image.width,
            height: options.height ?? options.image.height,
            bind() {
                gl.bindTexture(gl.TEXTURE_2D, texture);
            },
            activate(register: GLint, uniform: WebGLUniformLocation) {
                if (register < gl.TEXTURE0 || register >= gl.TEXTURE7) throw "invalid texture register";
                gl.uniform1i(uniform, register - gl.TEXTURE0);
                gl.activeTexture(register);
                this.bind();
            }
        };
    }

    _createFramebufferWrapper(framebuffer: WebGLFramebuffer | null, texture: Texture | null, depth: boolean): Framebuffer {
        const {gl} = this;
        return {
            id: framebuffer,
            texture,
            depth,
            bind() {
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            },
            viewport() {
                this.bind();
                const image = this.texture ?? gl.canvas;
                gl.viewport(0, 0, image.width, image.height);
            },
            clear(r, g, b, a) {
                this.bind();
                gl.clearColor(r, g, b, a);
                gl.clear(gl.COLOR_BUFFER_BIT | (this.depth? gl.DEPTH_BUFFER_BIT : 0));
            },
        };
    }

    drawToScreen(): Framebuffer {
        return this._createFramebufferWrapper(null, null, true);
    }

    createFramebuffer(width: number, height: number, options: {depth?: boolean, filter: 'linear'|'nearest'}): Framebuffer {
        const {gl} = this;
        const texture = this.createTexture({width, height, filter: options.filter});
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.id, 0);

        if (options.depth) {
            const depthBuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, texture.width, texture.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
        }

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Framebuffer is not complete:", status.toString(16));
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return this._createFramebufferWrapper(framebuffer, texture, options.depth ?? false);
    }

    createProgram(vert: string, frag: string): Program {
        const {gl} = this;

        function createShader(type, source): WebGLShader {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error("Error compiling shader:");
                console.error(gl.getShaderInfoLog(shader));
            }
            return shader;
        }

        const vs = createShader(gl.VERTEX_SHADER, vert);
        const fs = createShader(gl.FRAGMENT_SHADER, frag);
        const pr = gl.createProgram();
        gl.attachShader(pr, vs);
        gl.attachShader(pr, fs);
        gl.linkProgram(pr);

        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
            console.error("Error linking shader:");
            console.error(gl.getProgramInfoLog(pr));
        }

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        let program: Program = {
            use() { gl.useProgram(pr); },
        };

        for (let i = 0; i < gl.getProgramParameter(pr, gl.ACTIVE_ATTRIBUTES); i++) {
            let name = gl.getActiveAttrib(pr, i).name;
            program[name] = gl.getAttribLocation(pr, name);
        }
        for (let i = 0; i < gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS); i++) {
            let name = gl.getActiveUniform(pr, i).name;
            program[name] = gl.getUniformLocation(pr, name);
        }

        return program;
    }
}


//////////////////////////////////////////////////////////////////////
// Shaders

const vert_river = `
    precision highp float;
    uniform mat4 u_projection;
    attribute vec4 a_xyww; // x, y, width1, width2 (widths are constant across vertices)
    attribute vec3 a_barycentric; // TODO: in WebGL 2, calculate this from gl_VertexID;
    varying vec2 v_riverwidth;
    varying vec3 v_barycentric;
    void main() {
        v_riverwidth = a_xyww.ba;
        v_barycentric = a_barycentric;
        gl_Position = u_projection * vec4(a_xyww.xy, 0, 1);
    }`;

const frag_river = `
    precision mediump float;
    varying vec2 v_riverwidth;
    varying vec3 v_barycentric;
    const vec3 blue = vec3(0.2, 0.5, 0.7);
    void main() {
        float xt = v_barycentric.r / (v_barycentric.b + v_barycentric.r);
        float dist = sqrt(v_barycentric.b*v_barycentric.b + v_barycentric.r*v_barycentric.r + v_barycentric.b*v_barycentric.r);
        float pos = 0.5;
        float width = 0.35 * mix(v_riverwidth.x, v_riverwidth.y, xt); // variable width from r side to b side
        // NOTE: I've tried using screen space derivatives to make widths consistent between adjacent triangles,
        // but it ended up looking worse, so I reverted it. I multiplied the width by 2.0 * fwidth(v_barycentric.g)
        // and removed the divide by / s_length[s] in setRiverGeometry().
        // NOTE: the smoothstep is from w + minwidth to w - antialias thickness, but antialias thickness should
        // be calculated based on the matrix transform because we want it to be roughly 1 pixel; the min width should
        // probably also be 1 pixel
        float in_river = smoothstep(width + 0.025, max(0.0, width - 0.05), abs(dist - pos));
        vec4 river_color = in_river * vec4(blue, 1);
        // HACK: for debugging - if (min(v_barycentric.r, min(v_barycentric.g, v_barycentric.b)) < 0.05) river_color = vec4(0, 0, 0, 1);
        gl_FragColor = river_color;
    }`;

const vert_land = `
    precision highp float;
    uniform mat4 u_projection;
    attribute vec2 a_xy;
    attribute vec2 a_em; // NOTE: moisture channel unused
    varying float v_e;
    varying vec2 v_xy;
    void main() {
        vec4 pos = u_projection * vec4(a_xy, 0, 1);
        v_xy = (1.0 + pos.xy) * 0.5;
        v_e = a_em.x;
        gl_Position = pos;
    }`;

 const frag_land = `
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
    }`;

const vert_depth = `
    precision highp float;
    uniform mat4 u_projection;
    attribute vec2 a_xy;
    attribute vec2 a_em;
    varying float v_z;
    void main() {
        vec4 pos = u_projection * vec4(a_xy, max(0.0, a_em.x), 1);
        v_z = a_em.x;
        gl_Position = pos;
    }`;

const frag_depth = `
    precision highp float;
    varying float v_z;
    void main() {
        gl_FragColor = vec4(fract(256.0*v_z), floor(256.0*v_z)/256.0, 0, 1);
    }`;

const vert_drape = `
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
    }`;

const frag_drape = `
    precision highp float;
    uniform sampler2D u_colormap;
    uniform sampler2D u_mapdata;
    uniform sampler2D u_water;
    uniform sampler2D u_depth;
    uniform vec2 u_light_angle, u_inverse_texture_size;
    uniform float u_slope, u_flat,
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
        vec2 sample_offset = 0.5 * u_inverse_texture_size;
        vec2 pos = v_uv + sample_offset;
        vec2 dx = vec2(u_inverse_texture_size.x, 0),
             dy = vec2(0, u_inverse_texture_size.y);

        float zE = decipher(texture2D(u_mapdata, pos + dx));
        float zN = decipher(texture2D(u_mapdata, pos - dy));
        float zW = decipher(texture2D(u_mapdata, pos - dx));
        float zS = decipher(texture2D(u_mapdata, pos + dy));
        vec3 slope_vector = normalize(vec3(zS-zN, zE-zW, u_overhead * (u_inverse_texture_size.x + u_inverse_texture_size.y)));
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
    }`;

const vert_final = `
    precision highp float;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
        v_uv = a_uv;
        gl_Position = vec4(2.0 * v_uv - 1.0, 0.0, 1.0);
    }`;

const frag_final = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec2 u_offset;
    varying vec2 v_uv;
    void main() {
         gl_FragColor = texture2D(u_texture, v_uv + u_offset);
    }`;

//////////////////////////////////////////////////////////////////////
// Mapgen4 renderer

const fbo_texture_size: number = 2048;

export default class Renderer {
    numRiverTriangles: number = 0;

    topdown: mat4;
    projection: mat4;
    inverse_projection: mat4;

    a_quad_xy: Float32Array;
    a_quad_em: Float32Array;
    quad_elements_length: number; // have to store the original size because the worker thread borrows the actual array
    quad_elements: Int32Array;
    a_river_barycentric: Float32Array;
    a_river_xyww: Float32Array;

    screenshotCanvas: HTMLCanvasElement;
    screenshotCallback: () => void;
    renderParam: any;

    webgl: WebGLWrapper;

    texture_colormap: Texture;

    fbo_river: Framebuffer;
    fbo_land: Framebuffer;
    fbo_depth: Framebuffer;
    fbo_drape: Framebuffer;

    program_river: Program;
    program_land: Program;
    program_depth: Program;
    program_drape: Program;
    program_final: Program;

    buffer_fullscreen: Buffer;
    buffer_quad_xy: Buffer;
    buffer_quad_em: Buffer;
    buffer_quad_elements: Buffer;
    buffer_river_barycentric: Buffer;
    buffer_river_xyww: Buffer;

    constructor (mesh: Mesh) {
        const canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        this.webgl = new WebGLWrapper(canvas);

        this.resizeCanvas();

        this.topdown = mat4.create();
        mat4.translate(this.topdown, this.topdown, [-1, -1, 0]);
        mat4.scale(this.topdown, this.topdown, [1/500, 1/500, 1]);

        this.projection = mat4.create();
        this.inverse_projection = mat4.create();

        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.quad_elements_length = 3 * mesh.numSolidSides;
        this.quad_elements = new Int32Array(this.quad_elements_length);
        /* NOTE: The maximum number of river triangles will be when
         * there's a single binary tree that has every node filled.
         * Each of the N/2 leaves will produce 1 output triangle and
         * each of the N/2 nodes will produce 2 triangles. On average
         * there will be 1.5 output triangles per input triangle. */
        const numRiverVertices = 1.5 /* river triangles per input triangle */ * 3 /* vertices per triangle */ * mesh.numSolidTriangles;
        this.a_river_barycentric = new Float32Array(numRiverVertices * 3);
        this.a_river_xyww = new Float32Array(numRiverVertices * 4);
        for (let i = 0; i < numRiverVertices; i++) {
            this.a_river_barycentric[3 * i    ] = (i % 3 === 0)? 1.0 : 0.0;
            this.a_river_barycentric[3 * i + 1] = (i % 3 === 1)? 1.0 : 0.0;
            this.a_river_barycentric[3 * i + 2] = (i % 3 === 2)? 1.0 : 0.0;
        }

        Geometry.setMeshGeometry(mesh, this.a_quad_xy);

        this.buffer_quad_xy = this.webgl.createBuffer({update: 'static', data: this.a_quad_xy});
        this.buffer_quad_em = this.webgl.createBuffer({update: 'dynamic', data: this.a_quad_em});
        this.buffer_quad_elements = this.webgl.createBuffer({indices: true, update: 'dynamic', data: this.quad_elements});

        this.buffer_fullscreen = this.webgl.createBuffer({update: 'static', data: new Float32Array([-2, 0, 0, -2, 2, 2])});
        this.buffer_river_barycentric = this.webgl.createBuffer({update: 'static', data: this.a_river_barycentric});
        this.buffer_river_xyww = this.webgl.createBuffer({update: 'dynamic', data: this.a_river_xyww});

        this.texture_colormap = this.webgl.createTexture({data: colormap.data, width: colormap.width, height: colormap.height, filter: 'nearest'});

        this.fbo_land  = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: false, filter: 'nearest'}); // NOTE: linear filter erases noisy artifacts
        this.fbo_depth = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: true, filter: 'nearest'}); // NOTE: linear requires adjusting parameters
        this.fbo_river = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: false, filter: 'linear'}); // linear makes rivers look better
        this.fbo_drape = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: true, filter: 'linear'}); // linear to smooth out edges

        this.program_river = this.webgl.createProgram(vert_river, frag_river);
        this.program_land  = this.webgl.createProgram(vert_land,  frag_land);
        this.program_depth = this.webgl.createProgram(vert_depth, frag_depth);
        this.program_drape = this.webgl.createProgram(vert_drape, frag_drape);
        this.program_final = this.webgl.createProgram(vert_final, frag_final);

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
        this.buffer_quad_em.subdata(0, this.a_quad_em);
        this.buffer_quad_elements.subdata(0, this.quad_elements);
        this.buffer_river_xyww.subdata(0, this.a_river_xyww.subarray(0, 4 * 3 * this.numRiverTriangles));
    }

    /* Allow drawing at a different resolution than the internal texture size */
    resizeCanvas() {
        let canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        let size = canvas.clientWidth;
        size = 2048; /* could be smaller to increase performance */
        if (canvas.width !== size || canvas.height !== size) {
            console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${size}x${size}`);
            canvas.width = canvas.height = size;
            this.webgl.gl.viewport(0, 0, canvas.width, canvas.height);
        }
    }

    /* wrapper function to make the other drawing functions more convenient */
    drawGeneric(program: Program, fb: Framebuffer | null, draw: (gl: WebGLRenderingContext, program: Program) => void) {
        const {gl} = this.webgl;
        fb = fb ?? this.webgl.drawToScreen();
        fb.viewport();
        program.use();

        if (fb.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
        draw(gl, program);
        if (fb.depth) gl.disable(gl.DEPTH_TEST);
    }

    drawRivers() {
        this.drawGeneric(this.program_river, this.fbo_river, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.topdown);
            this.buffer_river_barycentric.vertexAttribPointer(program.a_barycentric, 3, gl.FLOAT, false, 0, 0);
            this.buffer_river_xyww.vertexAttribPointer(program.a_xyww, 4, gl.FLOAT, false, 0, 0);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendEquation(gl.FUNC_ADD);

            gl.drawArrays(gl.TRIANGLES, 0, 3 * this.numRiverTriangles);
        });
    }

    drawLand(outline_water: number) {
        this.drawGeneric(this.program_land, this.fbo_land, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.topdown);
            gl.uniform1f(program.u_outline_water, outline_water);
            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 0, 0);
            this.buffer_quad_em.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 0, 0);
            this.fbo_river.texture.activate(gl.TEXTURE0, program.u_water);

            this.buffer_quad_elements.bind();
            gl.drawElements(gl.TRIANGLES, this.quad_elements_length, gl.UNSIGNED_INT, 0);
        });
    }

    drawDepth() {
        this.drawGeneric(this.program_depth, this.fbo_depth, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.projection);
            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 0, 0);
            this.buffer_quad_em.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 0, 0);

            this.buffer_quad_elements.bind();
            gl.drawElements(gl.TRIANGLES, this.quad_elements_length, gl.UNSIGNED_INT, 0);
        });
    }

    drawDrape(renderParam: any) {
        const light_angle_rad = Math.PI / 180 * (renderParam.light_angle_deg + renderParam.rotate_deg);
        this.drawGeneric(this.program_drape, this.fbo_drape, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.projection);
            gl.uniform2fv(program.u_light_angle, [Math.cos(light_angle_rad), Math.sin(light_angle_rad)]);
            gl.uniform2fv(program.u_inverse_texture_size, [1.5 / this.fbo_drape.texture.width, 1.5 / this.fbo_drape.texture.height]);
            gl.uniform1f(program.u_slope, renderParam.slope);
            gl.uniform1f(program.u_flat, renderParam.flat);
            gl.uniform1f(program.u_ambient, renderParam.ambient);
            gl.uniform1f(program.u_overhead, renderParam.overhead);
            gl.uniform1f(program.u_outline_depth, renderParam.outline_depth * 5 * renderParam.zoom);
            gl.uniform1f(program.u_outline_coast, renderParam.outline_coast);
            gl.uniform1f(program.u_outline_water, renderParam.outline_water);
            gl.uniform1f(program.u_outline_strength, renderParam.outline_strength);
            gl.uniform1f(program.u_outline_threshold, renderParam.outline_threshold / 1000);
            gl.uniform1f(program.u_biome_colors, renderParam.biome_colors);

            this.texture_colormap.activate(gl.TEXTURE0, program.u_colormap);
            this.fbo_land.texture.activate(gl.TEXTURE1, program.u_mapdata);
            this.fbo_river.texture.activate(gl.TEXTURE2, program.u_water);
            this.fbo_depth.texture.activate(gl.TEXTURE3, program.u_depth);

            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 0, 0);
            this.buffer_quad_em.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 0, 0);

            this.buffer_quad_elements.bind();
            gl.drawElements(gl.TRIANGLES, this.quad_elements_length, gl.UNSIGNED_INT, 0);
        });
    }

    drawFinal(offset: [number, number]) {
        this.drawGeneric(this.program_final, null, (gl, program) => {
            gl.uniform2fv(program.u_offset, offset);
            this.buffer_fullscreen.vertexAttribPointer(program.a_uv, 2, gl.FLOAT, false, 0, 0);
            this.fbo_drape.texture.activate(gl.TEXTURE0, program.u_texture);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
    }

    startDrawingLoop() {
        const {gl} = this.webgl;

        const clearBuffers = () => {
            this.fbo_river.clear(0, 0, 0, 0);
            this.fbo_depth.clear(0, 0, 0, 1);
            this.fbo_drape.clear(0.3, 0.3, 0.35, 1);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        };

        /* Only draw when render parameters have been passed in;
         * otherwise skip the render and wait for the next tick */
        clearBuffers();
        const renderLoop = () => {
            requestAnimationFrame(renderLoop);
            const renderParam = this.renderParam;
            if (!renderParam) { return; }
            this.renderParam = undefined;

            if (this.numRiverTriangles > 0) {
                this.drawRivers();
            }

            this.drawLand(renderParam.outline_water);

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
                this.drawDepth();
            }

            this.drawDrape(renderParam);

            /* Draw the final texture to the canvas; this slightly blurs the outlines */
            this.drawFinal([0.5 / fbo_texture_size, 0.5 / fbo_texture_size]);

            if (this.screenshotCallback) {
                const ctx = this.screenshotCanvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height);
                const bytesPerRow = 4 * this.screenshotCanvas.width;
                const buffer = new Uint8Array(bytesPerRow * this.screenshotCanvas.height);
                gl.readPixels(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

                /* Flip row order from WebGL to Canvas */
                for (let y = 0; y < this.screenshotCanvas.height; y++) {
                    const rowBuffer = new Uint8Array(buffer.buffer, y * bytesPerRow, bytesPerRow);
                    imageData.data.set(rowBuffer, (this.screenshotCanvas.height-y-1) * bytesPerRow);
                }
                ctx.putImageData(imageData, 0, 0);

                this.screenshotCallback();
                this.screenshotCallback = null;
            }

            clearBuffers();
        };

        renderLoop();
    }

    updateView(renderParam: any) {
        this.renderParam = renderParam;
    }
}
