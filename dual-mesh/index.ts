/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

export type Point = [number, number];

export type Delaunator = {
    triangles: Int32Array;
    halfedges: Int32Array;
}

/**
 * Each initial point generates one region, where
 * points.slice(0, numBoundaryPoints) are considered to be
 * boundary points/regions.
 *
 * As created from Delaunator, the mesh has some sides without pairs.
 * Optionally use TriangleMesh.addGhostStructure() to add "ghost"
 * sides, triangles, and region to complete the mesh. Elements that
 * aren't "ghost" are called "solid".
 */
export type MeshInitializer = {
    points: Point[];
    delaunator: Delaunator;
    numBoundaryPoints?: number;
    numSolidSides?: number;
}

/**
 * Represent a triangle-polygon dual mesh with:
 *   - Regions (r)
 *   - Sides (s)
 *   - Triangles (t)
 *
 * Each element has an id:
 *   - 0 <= r < numRegions
 *   - 0 <= s < numSides
 *   - 0 <= t < numTriangles
 *
 * Naming convention: y_name_x takes x (r, s, t) as input and produces
 * y (r, s, t) as output.
 *
 * A side is directed. If two triangles t0, t1 are adjacent, there will
 * be two sides representing the boundary, one for t0 and one for t1. These
 * can be accessed with t_inner_s and t_outer_s.
 *
 * A side also represents the boundary between two regions. If two regions
 * r0, r1 are adjacent, there will be two sides representing the boundary,
 * r_begin_s and r_end_s.
 *
 * A side from p-->q will have a pair q-->p, at index
 * s_opposite_s. It will be -1 if the side doesn't have a pair.
 * Use addGhostStructure() to add ghost pairs to all sides.
 */
export class TriangleMesh {
    static t_from_s(s: number): number { return (s/3) | 0; }
    static s_prev_s(s: number): number { return (s % 3 === 0) ? s+2 : s-1; }
    static s_next_s(s: number): number { return (s % 3 === 2) ? s-2 : s+1; }

    // public data
    numSides: number;
    numSolidSides: number;
    numRegions: number;
    numSolidRegions: number;
    numTriangles: number;
    numSolidTriangles: number;
    numBoundaryRegions: number;

    // internal data that has accessors
    _halfedges: Int32Array;
    _triangles: Int32Array;
    _s_of_r: Int32Array;
    _vertex_t: Array<[number, number]>;
    _vertex_r: Array<[number, number]>;

    _options: any; // any other information we need to carry

    
    /**
     * Constructor takes partial mesh information from Delaunator and
     * constructs the rest.
     */
    constructor (init: MeshInitializer | TriangleMesh) {
        if ('points' in init) {
            // Construct a new TriangleMesh from points + delaunator data
            this.numBoundaryRegions = init.numBoundaryPoints ?? 0;
            this.numSolidSides = init.numSolidSides ?? 0;
            this._vertex_t = [];
            this.update(init);
        } else {
            // Shallow copy an existing TriangleMesh data
            Object.assign(this, init);
        }
    }

    
    /**
     * Update internal data structures from Delaunator 
     */
    update(init: MeshInitializer) {
        this._vertex_r = init.points;
        this._triangles = init.delaunator.triangles;
        this._halfedges = init.delaunator.halfedges;
        this._update();
    }

    
    /**
     * Update internal data structures to match the input mesh.
     *
     * Use if you have updated the triangles/halfedges with Delaunator
     * and want the dual mesh to match the updated data. Note that
     * this DOES not update boundary regions or ghost elements.
     */
    _update() {
        let {_triangles, _halfedges, _vertex_r, _vertex_t} = this;

        this.numSides = _triangles.length;
        this.numRegions = _vertex_r.length;
        this.numSolidRegions = this.numRegions - 1; // TODO: only if there are ghosts
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;

        if (this._vertex_t.length < this.numTriangles) {
            // Extend this array to be big enough
            const numOldTriangles = _vertex_t.length;
            const numNewTriangles = this.numTriangles - numOldTriangles;
            _vertex_t = _vertex_t.concat(new Array(numNewTriangles));
            for (let t = numOldTriangles; t < this.numTriangles; t++) {
                _vertex_t[t] = [0, 0];
            }
            this._vertex_t = _vertex_t;
        }
        
        // Construct an index for finding sides connected to a region
        this._s_of_r = new Int32Array(this.numRegions);
        for (let s = 0; s < _triangles.length; s++) {
            let endpoint = _triangles[TriangleMesh.s_next_s(s)];
            if (this._s_of_r[endpoint] === 0 || _halfedges[s] === -1) {
                this._s_of_r[endpoint] = s;
            }
        }

        // Construct triangle coordinates
        for (let s = 0; s < _triangles.length; s += 3) {
            let t = s/3,
            a = _vertex_r[_triangles[s]],
            b = _vertex_r[_triangles[s+1]],
            c = _vertex_r[_triangles[s+2]];
            if (this.is_ghost_s(s)) {
                // ghost triangle center is just outside the unpaired side
                let dx = b[0]-a[0], dy = b[1]-a[1];
                let scale = 10 / Math.sqrt(dx*dx + dy*dy); // go 10units away from side
                _vertex_t[t][0] = 0.5 * (a[0] + b[0]) + dy*scale;
                _vertex_t[t][1] = 0.5 * (a[1] + b[1]) - dx*scale;
            } else {
                // solid triangle center is at the centroid
                _vertex_t[t][0] = (a[0] + b[0] + c[0])/3;
                _vertex_t[t][1] = (a[1] + b[1] + c[1])/3;
            }
        }
    }

    
    /**
     * Construct ghost elements to complete the graph.
     */
    static addGhostStructure(init: MeshInitializer): MeshInitializer {
        const {triangles, halfedges} = init.delaunator;
        const numSolidSides = triangles.length;
        
        let numUnpairedSides = 0, firstUnpairedEdge = -1;
        let s_unpaired_r = []; // seed to side
        for (let s = 0; s < numSolidSides; s++) {
            if (halfedges[s] === -1) {
                numUnpairedSides++;
                s_unpaired_r[triangles[s]] = s;
                firstUnpairedEdge = s;
            }
        }

        const r_ghost = init.points.length;
        let newpoints = init.points.concat([[NaN, NaN]]);
        let r_newstart_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
        r_newstart_s.set(triangles);
        let s_newopposite_s = new Int32Array(numSolidSides + 3 * numUnpairedSides);
        s_newopposite_s.set(halfedges);

        for (let i = 0, s = firstUnpairedEdge;
             i < numUnpairedSides;
             i++, s = s_unpaired_r[r_newstart_s[TriangleMesh.s_next_s(s)]]) {

            // Construct a ghost side for s
            let s_ghost = numSolidSides + 3 * i;
            s_newopposite_s[s] = s_ghost;
            s_newopposite_s[s_ghost] = s;
            r_newstart_s[s_ghost] = r_newstart_s[TriangleMesh.s_next_s(s)];
            
            // Construct the rest of the ghost triangle
            r_newstart_s[s_ghost + 1] = r_newstart_s[s];
            r_newstart_s[s_ghost + 2] = r_ghost;
            let k = numSolidSides + (3 * i + 4) % (3 * numUnpairedSides);
            s_newopposite_s[s_ghost + 2] = k;
            s_newopposite_s[k] = s_ghost + 2;
        }

        return {
            numSolidSides,
            numBoundaryPoints: init.numBoundaryPoints,
            points: newpoints,
            delaunator: {
                triangles: r_newstart_s,
                halfedges: s_newopposite_s,
            }
        };
    }

    // Accessors
    
    x_of_r(r: number): number        { return this._vertex_r[r][0]; }
    y_of_r(r: number): number        { return this._vertex_r[r][1]; }
    x_of_t(t: number): number        { return this._vertex_t[t][0]; }
    y_of_t(t: number): number        { return this._vertex_t[t][1]; }
    pos_of_r(r: number, out: number[]=[]): number[] { out.length = 2; out[0] = this.x_of_r(r); out[1] = this.y_of_r(r); return out; }
    pos_of_t(t: number, out: number[]=[]): number[] { out.length = 2; out[0] = this.x_of_t(t); out[1] = this.y_of_t(t); return out; }
    
    r_begin_s(s: number): number  { return this._triangles[s]; }
    r_end_s(s: number): number    { return this._triangles[TriangleMesh.s_next_s(s)]; }

    t_inner_s(s: number): number  { return TriangleMesh.t_from_s(s); }
    t_outer_s(s: number): number  { return TriangleMesh.t_from_s(this._halfedges[s]); }

    s_next_s(s: number): number   { return TriangleMesh.s_next_s(s); }
    s_prev_s(s: number): number   { return TriangleMesh.s_prev_s(s); }
    
    s_opposite_s(s: number): number { return this._halfedges[s]; }

    s_around_t(t: number, s_out: number[] = []): number[] { s_out.length = 3; for (let i = 0; i < 3; i++) { s_out[i] = 3*t + i; } return s_out; }
    r_around_t(t: number, r_out: number[] = []): number[] { r_out.length = 3; for (let i = 0; i < 3; i++) { r_out[i] = this._triangles[3*t+i]; } return r_out; }
    t_around_t(t: number, t_out: number[] = []): number[] { t_out.length = 3; for (let i = 0; i < 3; i++) { t_out[i] = this.t_outer_s(3*t+i); } return t_out; }
    
    s_around_r(r: number, s_out: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        s_out.length = 0;
        do {
            s_out.push(this._halfedges[incoming]);
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return s_out;
    }

    r_around_r(r: number, r_out: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        r_out.length = 0;
        do {
            r_out.push(this.r_begin_s(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return r_out;
    }
    
    t_around_r(r: number, t_out: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        t_out.length = 0;
        do {
            t_out.push(TriangleMesh.t_from_s(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return t_out;
    }

    r_ghost(): number                 { return this.numRegions - 1; }
    is_ghost_s(s: number): boolean    { return s >= this.numSolidSides; }
    is_ghost_r(r: number): boolean    { return r === this.numRegions - 1; }
    is_ghost_t(t: number): boolean    { return this.is_ghost_s(3 * t); }
    is_boundary_s(s: number): boolean { return this.is_ghost_s(s) && (s % 3 === 0); }
    is_boundary_r(r: number): boolean { return r < this.numBoundaryRegions; }
}
