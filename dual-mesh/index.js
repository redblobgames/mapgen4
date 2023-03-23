/*
 * From https://github.com/redblobgames/dual-mesh
 * Copyright 2017 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */

'use strict';

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
 * Naming convention: x_name_y takes x (r, s, t) as input and produces
 * y (r, s, t) as output. If the output isn't a mesh index (r, s, t)
 * then the _y suffix is omitted.
 *
 * A side is directed. If two triangles t0, t1 are adjacent, there will
 * be two sides representing the boundary, one for t0 and one for t1. These
 * can be accessed with s_inner_t and s_outer_t.
 *
 * A side also represents the boundary between two regions. If two regions
 * r0, r1 are adjacent, there will be two sides representing the boundary,
 * s_begin_r and s_end_r.
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
class TriangleMesh {
    static s_to_t(s)   { return (s/3) | 0; }
    static s_prev_s(s) { return (s % 3 === 0) ? s+2 : s-1; }
    static s_next_s(s) { return (s % 3 === 2) ? s-2 : s+1; }

    /**
     * Constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in fromDelaunator.
     */
    constructor ({numBoundaryRegions, numSolidSides, _r_vertex, _triangles, _halfedges}) {
        Object.assign(this, {numBoundaryRegions, numSolidSides,
                             _r_vertex, _triangles, _halfedges});
        this._t_vertex = [];
        this._update();
    }

    /**
     * Update internal data structures from Delaunator 
     */
    update(points, delaunator) {
        this._r_vertex = points;
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
        let {_triangles, _halfedges, _r_vertex, _t_vertex} = this;

        this.numSides = _triangles.length;
        this.numRegions = _r_vertex.length;
        this.numSolidRegions = this.numRegions - 1; // TODO: only if there are ghosts
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;

        if (this._t_vertex.length < this.numTriangles) {
            // Extend this array to be big enough
            const numOldTriangles = _t_vertex.length;
            const numNewTriangles = this.numTriangles - numOldTriangles;
            _t_vertex = _t_vertex.concat(new Array(numNewTriangles));
            for (let t = numOldTriangles; t < this.numTriangles; t++) {
                _t_vertex[t] = [0, 0];
            }
            this._t_vertex = _t_vertex;
        }
        
        // Construct an index for finding sides connected to a region
        this._r_in_s = new Int32Array(this.numRegions);
        for (let s = 0; s < _triangles.length; s++) {
            let endpoint = _triangles[TriangleMesh.s_next_s(s)];
            if (this._r_in_s[endpoint] === 0 || _halfedges[s] === -1) {
                this._r_in_s[endpoint] = s;
            }
        }

        // Construct triangle coordinates
        for (let s = 0; s < _triangles.length; s += 3) {
            let t = s/3,
                a = _r_vertex[_triangles[s]],
                b = _r_vertex[_triangles[s+1]],
                c = _r_vertex[_triangles[s+2]];
            if (this.s_ghost(s)) {
                // ghost triangle center is just outside the unpaired side
                let dx = b[0]-a[0], dy = b[1]-a[1];
                let scale = 10 / Math.sqrt(dx*dx + dy*dy); // go 10units away from side
                _t_vertex[t][0] = 0.5 * (a[0] + b[0]) + dy*scale;
                _t_vertex[t][1] = 0.5 * (a[1] + b[1]) - dx*scale;
            } else {
                // solid triangle center is at the centroid
                _t_vertex[t][0] = (a[0] + b[0] + c[0])/3;
                _t_vertex[t][1] = (a[1] + b[1] + c[1])/3;
            }
        }
    }

    /**
     * Construct a DualMesh from a Delaunator object, without any
     * additional boundary regions.
     */
    static fromDelaunator(points, delaunator) {
        return new TriangleMesh({
            numBoundaryRegions: 0,
            numSolidSides: delaunator.triangles.length,
            _r_vertex: points,
            _triangles: delaunator.triangles,
            _halfedges: delaunator.halfedges,
        });
    }


    r_x(r)        { return this._r_vertex[r][0]; }
    r_y(r)        { return this._r_vertex[r][1]; }
    t_x(r)        { return this._t_vertex[r][0]; }
    t_y(r)        { return this._t_vertex[r][1]; }
    r_pos(out, r) { out.length = 2; out[0] = this.r_x(r); out[1] = this.r_y(r); return out; }
    t_pos(out, t) { out.length = 2; out[0] = this.t_x(t); out[1] = this.t_y(t); return out; }
    
    s_begin_r(s)  { return this._triangles[s]; }
    s_end_r(s)    { return this._triangles[TriangleMesh.s_next_s(s)]; }

    s_inner_t(s)  { return TriangleMesh.s_to_t(s); }
    s_outer_t(s)  { return TriangleMesh.s_to_t(this._halfedges[s]); }

    s_next_s(s)   { return TriangleMesh.s_next_s(s); }
    s_prev_s(s)   { return TriangleMesh.s_prev_s(s); }
    
    s_opposite_s(s) { return this._halfedges[s]; }
    
    t_circulate_s(out_s, t) { out_s.length = 3; for (let i = 0; i < 3; i++) { out_s[i] = 3*t + i; } return out_s; }
    t_circulate_r(out_r, t) { out_r.length = 3; for (let i = 0; i < 3; i++) { out_r[i] = this._triangles[3*t+i]; } return out_r; }
    t_circulate_t(out_t, t) { out_t.length = 3; for (let i = 0; i < 3; i++) { out_t[i] = this.s_outer_t(3*t+i); } return out_t; }
    
    r_circulate_s(out_s, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_s.length = 0;
        do {
            out_s.push(this._halfedges[incoming]);
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_s;
    }

    r_circulate_r(out_r, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_r.length = 0;
        do {
            out_r.push(this.s_begin_r(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_r;
    }
    
    r_circulate_t(out_t, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_t.length = 0;
        do {
            out_t.push(TriangleMesh.s_to_t(incoming));
            let outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_t;
    }

    ghost_r()     { return this.numRegions - 1; }
    s_ghost(s)    { return s >= this.numSolidSides; }
    r_ghost(r)    { return r === this.numRegions - 1; }
    t_ghost(t)    { return this.s_ghost(3 * t); }
    s_boundary(s) { return this.s_ghost(s) && (s % 3 === 0); }
    r_boundary(r) { return r < this.numBoundaryRegions; }
}

module.exports = TriangleMesh;
