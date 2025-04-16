/*
 * From https://www.redblobgames.com/x/2515-mapgen-trading/
 * Copyright 2018, 2025 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data,
 * simulates the traders, and renders everything to <canvas> elements.
 */

import {makeRandInt}  from '@redblobgames/prng';
import FlatQueue from 'flatqueue';
import {TriangleMesh} from "./dual-mesh/index.ts";
import Map            from "./map.ts";
import type {Mesh}    from "./types.d.ts";
import * as Draw      from "./draw.js";
import * as Colormap2 from "./colormap2.js";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

function lerp(a: number, b: number, t: number): number { return a * (1-t) + b * t; }
function unlerp(a: number, b: number, t: number): number { return (t - a) / (b - a); }
function rescale(v: number, from_lo: number, from_hi: number, to_lo: number, to_hi: number): number { return lerp(to_lo, to_hi, unlerp(from_lo, from_hi, v)); }
function mod(a: number, b: number): number { return (a % b + b) % b; }


type Waypoint = {x: number, y: number, s: number};
type Path = {startTick: number, endTick: number, waypoints: Array<Waypoint>}; // waypoints, plus animation about current segment

const NUM_PATHS = 20000;
const PARTICLE_SPEED = 3;
const PATHS_PER_DESTINATION = 500; // batch size to reuse dijkstra output for this many paths
class Travel {
    tick: number;
    map: Map;
    randInt: (max: number) => number;
    r_queue: FlatQueue<number>;
    movement_cost_s: Float32Array;
    cost_to_r: Float32Array;
    s_enter_r: Int16Array; // for any given r, the side that led to r
    _paths_left_before_running_dijsktra: number;
    paths: Array<Path>; // waypoints stored in reverse order

    constructor (map: Map) {
        this.tick = 0;
        this.map = map;
        this.randInt = makeRandInt(12345);
        this.r_queue = new FlatQueue<number>();
        this.r_queue.ids = new Uint16Array(map.mesh.numRegions);
        this.r_queue.values = new Float32Array(map.mesh.numRegions);
        this.movement_cost_s = new Float32Array(map.mesh.numSides);
        this.s_enter_r = new Int16Array(map.mesh.numRegions);
        this.cost_to_r = new Float32Array(map.mesh.numRegions);
        this._paths_left_before_running_dijsktra = 0;
        this.paths = [];
    }

    pickRandomRegion(): number {
        // Pick only one of the land regions
        return this.map.r_land[this.randInt(this.map.r_land.length || 1)];
    }

    // calculate the movement cost between the adjacent regions along side s
    movementCost(s: number) {
        const {map} = this;
        const {mesh} = map;

        const r1 = mesh.r_begin_s(s),
              r2 = mesh.r_end_s(s);

        if (map.elevation_r[r2] < 0) return Infinity; // ocean
        if (map.flow_s[s] + map.flow_s[mesh.s_opposite_s(s)] > 5) return Infinity; // wide rivers
        // TODO: calculate shallowocean_r and have lower cost travel on it

        let cost = Math.hypot(
            mesh.x_of_r(r1) - mesh.x_of_r(r2),
            mesh.y_of_r(r1) - mesh.y_of_r(r2)
        ) / PARTICLE_SPEED;

        if (map.elevation_r[r1] > 0.5) cost *= 15; // mountains
        else if (map.elevation_r[r2] > 0.5) cost *= 15; // mountains
        else if (map.elevation_r[r1] > 0.25) cost *= 5; // hills
        else if (map.elevation_r[r2] > 0.25) cost *= 5; // hills

        return cost;
    }

    // For performance we'll cache some information about the current map, and
    // update it when the map changes, but not update it every tick
    updateCache() {
        for (let s = 0; s < this.map.mesh.numSides; s++) {
            this.movement_cost_s[s] = this.movementCost(s);
        }
    }

    findAllPathsToRegion(r_goal: number) {
        // NOTE: allow moving through water, but cost depends on coast vs ocean
        const {r_queue, cost_to_r, s_enter_r, map} = this;
        const {mesh} = map;
        s_enter_r.fill(-1);
        cost_to_r.fill(Infinity);
        cost_to_r[r_goal] = 0.0;
        r_queue.clear();
        r_queue.push(r_goal, 0.0);

        let s_out = [];
        while (r_queue.length > 0) {
            let r_current = r_queue.pop();
            for (let s of mesh.s_around_r(r_current, s_out)) {
                if (mesh.is_ghost_s(s)) continue;
                let r_next = mesh.r_end_s(s);
                let cost = this.movement_cost_s[s];
                if (cost === Infinity) continue;
                let cost_next = cost_to_r[r_current] + cost;
                if (cost_next < cost_to_r[r_next]) {
                    cost_to_r[r_next] = cost_next;
                    s_enter_r[r_next] = s;
                    r_queue.push(r_next, cost_next);
                }
            }
        }
    }

    // Construct a particle from a random region to whichever
    // region was selected for this tick's dijkstra's algorithm
    // (this is for efficiency, so we can get hundreds of agents
    // using one pathfinding call instead of each one running A*)
    constructParticle(): Path {
        const SPREAD = 5.0;

        if (--this._paths_left_before_running_dijsktra < 0) {
            this._paths_left_before_running_dijsktra = PATHS_PER_DESTINATION;
            this.findAllPathsToRegion(this.pickRandomRegion());
        }
        
        let r_from = this.pickRandomRegion();
        let waypoints: Array<Waypoint> = [];

        // Although the paths are region to region, I want to store
        // waypoints on the region *sides*
        let r = r_from;
        let positionOnSide = 0.1 + Math.random() * 0.45;
        while (r >= 0) {
            let s = this.s_enter_r[r];
            if (s < 0) break; // path could not reach target, so let's stop here
            let t1 = this.map.mesh.t_inner_s(s),
                t2 = this.map.mesh.t_outer_s(s);
            let x1 = this.map.mesh.x_of_t(t1),
                y1 = this.map.mesh.y_of_t(t1),
                x2 = this.map.mesh.x_of_t(t2),
                y2 = this.map.mesh.y_of_t(t2);
            let position = positionOnSide + 0.1 * (Math.random() - Math.random());
            let x = lerp(x1, x2, position),
                y = lerp(y1, y2, position);
            waypoints.push({x, y, s: this.s_enter_r[r]});
            r = this.map.mesh.r_begin_s(this.s_enter_r[r]);
        }
        waypoints.reverse(); // we ran Dijkstra's *from* a random point, but we want a path *to* that point
        if (waypoints.length > 0) {
            return {startTick: this.tick, endTick: this.tick + this.movement_cost_s[waypoints.at(-1).s], waypoints};
        } else {
            return {startTick: this.tick, endTick: this.tick-1, waypoints};
        }
    }
    
    simulate() {
        if (this.map.r_land.length === 0) return; // hasn't been initialized

        if (this.paths.length < NUM_PATHS) {
            const BATCH_SIZE = 500;
            for (let i = 0; i < BATCH_SIZE && this.paths.length < NUM_PATHS; i++) {
                this.paths.push(this.constructParticle());
            }
        }

        // Move along paths, and generate new path once one has expired
        for (let i = 0; i < this.paths.length; i++) {
            let path = this.paths[i];
            while (path.waypoints.length > 1 && this.tick >= path.endTick) { // waypoint expired
                let s = path.waypoints.at(-1).s;
                path.waypoints.pop();
                path.startTick = path.endTick;
                path.endTick += this.movement_cost_s[s];
            }
            if (path.waypoints.length === 1) { // entire path expired
                this.paths[i] = this.constructParticle();
            } else if (!isFinite(path.endTick) || path.waypoints.length === 0) { // path got stuck
                this.paths[i] = this.constructParticle();
            }
        }

        this.tick++;
    }

    particles() {
        // Calculate the current particle positions
        let positions = [];
        for (let i = 0; i < this.paths.length; i++) {
            if (this.paths[i].waypoints.length < 2) continue;
            let p1 = this.paths[i].waypoints.at(-1),
                p2 = this.paths[i].waypoints.at(-2);
            let t = unlerp(this.paths[i].startTick, this.paths[i].endTick, this.tick);
            positions.push([lerp(p1.x, p2.x, t), lerp(p1.y, p2.y, t)]);
        }
        return positions;
    }
}

// Draw the mapgen2 output for mapgen4 maps
function renderMap(ctx: OffscreenCanvasRenderingContext2D, param: any, mapIconsConfig: any, map: Map) {
    ctx.reset();
    ctx.scale(2048/1000, 2048/1000); // mapgen4 draws to a 1000✕1000 region
    ctx.clearRect(0, 0, 1000, 1000);

    const noisyEdges = false;
    const colormap = new Colormap2.Smooth();
    colormap.riversParam = param.rivers;
    colormap.spacingParam = param.spacing;
    Draw.background(ctx, colormap);
    Draw.noisyRegions(ctx, map, colormap, noisyEdges);
    Draw.rivers(ctx, map, colormap, noisyEdges, true);
    Draw.coastlines(ctx, map, colormap, noisyEdges);
    Draw.regionIcons(ctx, map, mapIconsConfig, makeRandInt(12345));
}

function renderOverlay(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, map: Map, travel: Travel) {
    const size = canvas.width;
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    // Suppose the "reference" resolution is 1024✕1024. Then one pixel
    // uses 1/1024² of the space. But if the resolution is instead
    // 2048✕2048, then one pixel uses ¼ as much space, so I want it to
    // be 4✕ as bright. So let's say 128 is the reference brightness
    // at 1024✕1024, and scale it up or down.
    const pixelBrightnessAdjust = (size/1024) ** 2;
    const pixelBrightness = (128 * pixelBrightnessAdjust) | 0;

    pixels.fill(0);
    let particles = travel.particles();
    for (let i = 0; i < particles.length; i++) {
        let [x, y] = particles[i];
        x = lerp(0, size, x/1000.0) | 0;
        y = lerp(0, size, y/1000.0) | 0;
        if (0 <= x && x < size && 0 <= y && y < size) {
            let start = 4 * (y * size + x);
            for (let channel = 0; channel < 3; channel++) {
                pixels[start+channel] = 255; // white for now
            }
            pixels[start+3] += pixelBrightness;
        }
    }
    ctx.putImageData(imageData, 0, 0);
}


// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const mapCanvas = event.data.mapCanvas as OffscreenCanvas;
    const overlayCanvas = event.data.overlayCanvas as OffscreenCanvas;
    const mesh = new TriangleMesh(event.data.mesh as TriangleMesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);
    const mapIconsConfig = event.data.mapIconsConfig;
    mapIconsConfig.image = event.data.mapIconsBitmap;

    const ctxMap = mapCanvas.getContext('2d');
    const ctxOverlay = overlayCanvas.getContext('2d', {willReadFrequently: true});
    ctxOverlay.imageSmoothingEnabled = false;
    let param = null;

    let travel = new Travel(map);
    function tick() {
        travel.simulate();
        // NOTE: have to put this in requestAnimationFrame to avoid flickering
        // with an offscreen canvas
        requestAnimationFrame(() => renderOverlay(overlayCanvas, ctxOverlay, map, travel));
    }
    setInterval(tick, 1000/15);

    // This handler is for all subsequent messages, and it only gets
    // called after the user changes the map by painting
    handler = (event) => {
        let {constraints, outputBoundingRect} = event.data;
        param = event.data.param;

        let numRiverTriangles = 0;
        let start_time = performance.now();
        
        map.assignElevation(param.elevation, constraints);
        map.assignRainfall(param.biomes);
        map.assignRivers(param.rivers);

        travel.updateCache();

        let newOverlaySize = Math.floor(outputBoundingRect.width);
        if (newOverlaySize !== overlayCanvas.width) { // resetting size erases canvas, so do it only when it changes
            overlayCanvas.width = overlayCanvas.height = newOverlaySize;
        }
        renderMap(ctxMap, param, mapIconsConfig, map);

        let elapsed = performance.now() - start_time;

        worker.postMessage(
            {elapsed,
             numRiverTriangles,
            }
        );
    };
};


onmessage = event => handler(event);
