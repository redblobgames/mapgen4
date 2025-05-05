/*
 * From https://www.redblobgames.com/x/2515-mapgen-trading/
 * Copyright 2025 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Simulate travelers moving between random points on the map.
 */

import {makeRandInt}  from '@redblobgames/prng';
import FlatQueue from 'flatqueue';
import Map            from "./map.ts";

function lerp(a: number, b: number, t: number): number { return a * (1-t) + b * t; }
function unlerp(a: number, b: number, t: number): number { return (t - a) / (b - a); }

type Waypoint = {x: number, y: number, s: number};
type Path = {startTick: number, endTick: number, waypoints: Array<Waypoint>}; // waypoints, plus animation about current segment

const NUM_PATHS = 20000;
const PATHS_PER_DESTINATION = 500; // batch size to reuse dijkstra output for this many paths
const EXPIRE_PATH_AFTER_TICKS = 150;
export class Travelers {
    tick: number;
    map: Map;
    param: any;
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
        this.param = null; // will be set by the worker
        this.randInt = makeRandInt(12345);
        this.r_queue = new FlatQueue<number>();
        // @ts-ignore
        this.r_queue.ids = new Uint16Array(map.mesh.numRegions);
        // @ts-ignore
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

    is_ocean_r(r: number): boolean {
        return this.map.elevation_r[r] < 0 && !this.map.r_coastal.has(r);
    }

    // calculate the movement cost between the adjacent regions along side s
    movementCost(s: number) {
        const {map, param} = this;
        const {mesh} = map;

        const r1 = mesh.r_begin_s(s),
              r2 = mesh.r_end_s(s);

        // Don't allow traveling in deep ocean:
        if (this.is_ocean_r(r1)) return Infinity;
        if (this.is_ocean_r(r2)) return Infinity;

        // Don't allow crossing wide rivers: (TODO: make this honor lg_min_flow and lg_river_width)
        if (map.flow_s[s] + map.flow_s[mesh.s_opposite_s(s)] > 5) return Infinity;

        let cost = Math.hypot(
            mesh.x_of_r(r1) - mesh.x_of_r(r2),
            mesh.y_of_r(r1) - mesh.y_of_r(r2)
        ) / param.speed;

        if (map.elevation_r[r1] > 0.5 || map.elevation_r[r2] > 0.5) cost *= param.mountains;
        else if (map.elevation_r[r1] > 0.25 || map.elevation_r[r2] > 0.25) cost *= param.hills;
        else if (Math.abs(map.elevation_r[r1] - map.elevation_r[r2]) > 0.1) cost *= param.sloped;

        if ((map.elevation_r[r1] < 0) !== (map.elevation_r[r2] < 0)) cost *= param.mode_switch; // boat to cart or back

        return cost;
    }

    // For performance we'll cache some information about the current map, and
    // update it when the map changes, but not update it every tick
    updateCache(param) {
        this.param = param;
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
    constructParticle(r_previous=undefined): Path {
        if (--this._paths_left_before_running_dijsktra < 0) {
            this._paths_left_before_running_dijsktra = PATHS_PER_DESTINATION;
            this.findAllPathsToRegion(this.pickRandomRegion());
        }

        let r_from = r_previous ?? this.pickRandomRegion();
        let waypoints: Array<Waypoint> = [];

        // Although the paths are region to region, I want to store
        // waypoints on the region *sides*. This allows them to form
        // lanes. By default there's one lane in each direction.
        let r = r_from;
        let positionOnSide = 0.25 + this.param.lane_width * (Math.random() - 0.5);
        while (r >= 0) {
            let s = this.s_enter_r[r];
            if (s < 0) break; // path could not reach target, so let's stop here
            let t1 = this.map.mesh.t_inner_s(s),
                t2 = this.map.mesh.t_outer_s(s);
            let x1 = this.map.mesh.x_of_t(t1),
                y1 = this.map.mesh.y_of_t(t1),
                x2 = this.map.mesh.x_of_t(t2),
                y2 = this.map.mesh.y_of_t(t2);
            let position = positionOnSide + this.param.lane_changing * (Math.random() - Math.random());
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

            if (path.waypoints.length <= 1 || path.endTick > path.startTick + EXPIRE_PATH_AFTER_TICKS) { // entire path expired, or path got stuck
                this.paths[i] = this.constructParticle();
            } else {
                let r_current = this.map.mesh.r_begin_s(path.waypoints.at(-1).s);
                if (path.endTick === Infinity || this.is_ocean_r(r_current)) { // fell in water
                    // Use the previous region and hope it's still good, so that the traveler
                    // turns around from this point and goes to some other destination
                    // TODO: this doesn't look right either, but looks better than what I had before
                    let r_previous = this.map.mesh.r_begin_s(path.waypoints.at(-2).s);
                    this.paths[i] = this.constructParticle(r_previous);
                }
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
