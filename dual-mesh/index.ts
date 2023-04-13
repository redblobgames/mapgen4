/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

type Delaunator = {
    triangles: Int32Array;
    halfedges: Int32Array;
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
 * Each side will have a pair, accessed with s_opposite_s.
 *
 * If created using the functions in create.js, the mesh has no
 * boundaries; it wraps around the "back" using a "ghost" region. Some
 * regions are marked as the boundary; these are connected to the
 * ghost region. Ghost triangles and ghost sides connect these
 * boundary regions to the ghost region. Elements that aren't "ghost"
 * are called "solid".
 */
export default class TriangleMesh {
    static t_from_s(s: number): number { return (s/3) | 0; }
    static s_prev_s(s: number): number { return (s % 3 === 0) ? s+2 : s-1; }
    static s_next_s(s: number): number { return (s % 3 === 2) ? s-2 : s+1; }

    numSides: number;
    numSolidSides: number;
    numRegions: number;
    numSolidRegions: number;
    numTriangles: number;
    numSolidTriangles: number;
    numBoundaryRegions: number;

    _halfedges: Int32Array;
    _triangles: Int32Array;
    _s_of_r: Int32Array;
    _vertex_t: Array<[number, number]>;
    _vertex_r: Array<[number, number]>;

    _options: any; // any other information we need to carry
    
    /**
     * Constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in fromDelaunator.
     */
    constructor ({numBoundaryRegions, numSolidSides, _vertex_r, _triangles, _halfedges}) {
        Object.assign(this, {numBoundaryRegions, numSolidSides,
                             _vertex_r, _triangles, _halfedges});
        this._vertex_t = [];
        this._update();
    }

    /**
     * Update internal data structures from Delaunator 
     */
    update(points: [number, number][], delaunator: Delaunator) {
        this._vertex_r = points;
        this._triangles = delaunator.triangles;
        this._halfedges = delaunator.halfedges;
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
     * Construct a DualMesh from a Delaunator object, without any
     * additional boundary regions.
     */
    static fromDelaunator(points: Array<[number, number]>, delaunator: Delaunator) {
        return new TriangleMesh({
            numBoundaryRegions: 0,
            numSolidSides: delaunator.triangles.length,
            _vertex_r: points,
            _triangles: delaunator.triangles,
            _halfedges: delaunator.halfedges,
        });
    }


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

    s_around_t(t: number, out_s: number[] = []): number[] { out_s.length = 3; for (let i = 0; i < 3; i++) { out_s[i] = 3*t + i; } return out_s; }
    r_around_t(t: number, out_r: number[] = []): number[] { out_r.length = 3; for (let i = 0; i < 3; i++) { out_r[i] = this._triangles[3*t+i]; } return out_r; }
    t_around_t(t: number, out_t: number[] = []): number[] { out_t.length = 3; for (let i = 0; i < 3; i++) { out_t[i] = this.t_outer_s(3*t+i); } return out_t; }
    
    s_around_r(r: number, out_s: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        out_s.length = 0;
        do {
            out_s.push(this._halfedges[incoming]);
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_s;
    }

    r_around_r(r: number, out_r: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        out_r.length = 0;
        do {
            out_r.push(this.r_begin_s(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_r;
    }
    
    t_around_r(r: number, out_t: number[] = []): number[] {
        const s0 = this._s_of_r[r];
        let incoming = s0;
        out_t.length = 0;
        do {
            out_t.push(TriangleMesh.t_from_s(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_t;
    }

    r_ghost(): number                 { return this.numRegions - 1; }
    is_ghost_s(s: number): boolean    { return s >= this.numSolidSides; }
    is_ghost_r(r: number): boolean    { return r === this.numRegions - 1; }
    is_ghost_t(t: number): boolean    { return this.is_ghost_s(3 * t); }
    is_boundary_s(s: number): boolean { return this.is_ghost_s(s) && (s % 3 === 0); }
    is_boundary_r(r: number): boolean { return r < this.numBoundaryRegions; }
}
