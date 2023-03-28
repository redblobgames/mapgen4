/*
 * From https://www.redblobgames.com/x/2312-dual-mesh/
 * Copyright 2017, 2023 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
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
var TriangleMesh = /** @class */ (function () {
    /**
     * Constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in fromDelaunator.
     */
    function TriangleMesh(_a) {
        var numBoundaryRegions = _a.numBoundaryRegions, numSolidSides = _a.numSolidSides, _r_vertex = _a._r_vertex, _triangles = _a._triangles, _halfedges = _a._halfedges;
        Object.assign(this, { numBoundaryRegions: numBoundaryRegions, numSolidSides: numSolidSides, _r_vertex: _r_vertex, _triangles: _triangles, _halfedges: _halfedges });
        this._t_vertex = [];
        this._update();
    }
    TriangleMesh.s_to_t = function (s) { return (s / 3) | 0; };
    TriangleMesh.s_prev_s = function (s) { return (s % 3 === 0) ? s + 2 : s - 1; };
    TriangleMesh.s_next_s = function (s) { return (s % 3 === 2) ? s - 2 : s + 1; };
    /**
     * Update internal data structures from Delaunator
     */
    TriangleMesh.prototype.update = function (points, delaunator) {
        this._r_vertex = points;
        this._triangles = delaunator.triangles;
        this._halfedges = delaunator.halfedges;
        this._update();
    };
    /**
     * Update internal data structures to match the input mesh.
     *
     * Use if you have updated the triangles/halfedges with Delaunator
     * and want the dual mesh to match the updated data. Note that
     * this DOES not update boundary regions or ghost elements.
     */
    TriangleMesh.prototype._update = function () {
        var _a = this, _triangles = _a._triangles, _halfedges = _a._halfedges, _r_vertex = _a._r_vertex, _t_vertex = _a._t_vertex;
        this.numSides = _triangles.length;
        this.numRegions = _r_vertex.length;
        this.numSolidRegions = this.numRegions - 1; // TODO: only if there are ghosts
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;
        if (this._t_vertex.length < this.numTriangles) {
            // Extend this array to be big enough
            var numOldTriangles = _t_vertex.length;
            var numNewTriangles = this.numTriangles - numOldTriangles;
            _t_vertex = _t_vertex.concat(new Array(numNewTriangles));
            for (var t = numOldTriangles; t < this.numTriangles; t++) {
                _t_vertex[t] = [0, 0];
            }
            this._t_vertex = _t_vertex;
        }
        // Construct an index for finding sides connected to a region
        this._r_in_s = new Int32Array(this.numRegions);
        for (var s = 0; s < _triangles.length; s++) {
            var endpoint = _triangles[TriangleMesh.s_next_s(s)];
            if (this._r_in_s[endpoint] === 0 || _halfedges[s] === -1) {
                this._r_in_s[endpoint] = s;
            }
        }
        // Construct triangle coordinates
        for (var s = 0; s < _triangles.length; s += 3) {
            var t = s / 3, a = _r_vertex[_triangles[s]], b = _r_vertex[_triangles[s + 1]], c = _r_vertex[_triangles[s + 2]];
            if (this.s_ghost(s)) {
                // ghost triangle center is just outside the unpaired side
                var dx = b[0] - a[0], dy = b[1] - a[1];
                var scale = 10 / Math.sqrt(dx * dx + dy * dy); // go 10units away from side
                _t_vertex[t][0] = 0.5 * (a[0] + b[0]) + dy * scale;
                _t_vertex[t][1] = 0.5 * (a[1] + b[1]) - dx * scale;
            }
            else {
                // solid triangle center is at the centroid
                _t_vertex[t][0] = (a[0] + b[0] + c[0]) / 3;
                _t_vertex[t][1] = (a[1] + b[1] + c[1]) / 3;
            }
        }
    };
    /**
     * Construct a DualMesh from a Delaunator object, without any
     * additional boundary regions.
     */
    TriangleMesh.fromDelaunator = function (points, delaunator) {
        return new TriangleMesh({
            numBoundaryRegions: 0,
            numSolidSides: delaunator.triangles.length,
            _r_vertex: points,
            _triangles: delaunator.triangles,
            _halfedges: delaunator.halfedges,
        });
    };
    TriangleMesh.prototype.r_x = function (r) { return this._r_vertex[r][0]; };
    TriangleMesh.prototype.r_y = function (r) { return this._r_vertex[r][1]; };
    TriangleMesh.prototype.t_x = function (t) { return this._t_vertex[t][0]; };
    TriangleMesh.prototype.t_y = function (t) { return this._t_vertex[t][1]; };
    TriangleMesh.prototype.r_pos = function (out, r) { out.length = 2; out[0] = this.r_x(r); out[1] = this.r_y(r); return out; };
    TriangleMesh.prototype.t_pos = function (out, t) { out.length = 2; out[0] = this.t_x(t); out[1] = this.t_y(t); return out; };
    TriangleMesh.prototype.s_begin_r = function (s) { return this._triangles[s]; };
    TriangleMesh.prototype.s_end_r = function (s) { return this._triangles[TriangleMesh.s_next_s(s)]; };
    TriangleMesh.prototype.s_inner_t = function (s) { return TriangleMesh.s_to_t(s); };
    TriangleMesh.prototype.s_outer_t = function (s) { return TriangleMesh.s_to_t(this._halfedges[s]); };
    TriangleMesh.prototype.s_next_s = function (s) { return TriangleMesh.s_next_s(s); };
    TriangleMesh.prototype.s_prev_s = function (s) { return TriangleMesh.s_prev_s(s); };
    TriangleMesh.prototype.s_opposite_s = function (s) { return this._halfedges[s]; };
    TriangleMesh.prototype.t_circulate_s = function (out_s, t) { out_s.length = 3; for (var i = 0; i < 3; i++) {
        out_s[i] = 3 * t + i;
    } return out_s; };
    TriangleMesh.prototype.t_circulate_r = function (out_r, t) { out_r.length = 3; for (var i = 0; i < 3; i++) {
        out_r[i] = this._triangles[3 * t + i];
    } return out_r; };
    TriangleMesh.prototype.t_circulate_t = function (out_t, t) { out_t.length = 3; for (var i = 0; i < 3; i++) {
        out_t[i] = this.s_outer_t(3 * t + i);
    } return out_t; };
    TriangleMesh.prototype.r_circulate_s = function (out_s, r) {
        var s0 = this._r_in_s[r];
        var incoming = s0;
        out_s.length = 0;
        do {
            out_s.push(this._halfedges[incoming]);
            var outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_s;
    };
    TriangleMesh.prototype.r_circulate_r = function (out_r, r) {
        var s0 = this._r_in_s[r];
        var incoming = s0;
        out_r.length = 0;
        do {
            out_r.push(this.s_begin_r(incoming));
            var outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_r;
    };
    TriangleMesh.prototype.r_circulate_t = function (out_t, r) {
        var s0 = this._r_in_s[r];
        var incoming = s0;
        out_t.length = 0;
        do {
            out_t.push(TriangleMesh.s_to_t(incoming));
            var outgoing = TriangleMesh.s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_t;
    };
    TriangleMesh.prototype.ghost_r = function () { return this.numRegions - 1; };
    TriangleMesh.prototype.s_ghost = function (s) { return s >= this.numSolidSides; };
    TriangleMesh.prototype.r_ghost = function (r) { return r === this.numRegions - 1; };
    TriangleMesh.prototype.t_ghost = function (t) { return this.s_ghost(3 * t); };
    TriangleMesh.prototype.s_boundary = function (s) { return this.s_ghost(s) && (s % 3 === 0); };
    TriangleMesh.prototype.r_boundary = function (r) { return r < this.numBoundaryRegions; };
    return TriangleMesh;
}());
export default TriangleMesh;
