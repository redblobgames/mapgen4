type Delaunator = {
    triangles: Int32Array;
    halfedges: Int32Array;
};
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
export default class TriangleMesh {
    static s_to_t(s: number): number;
    static s_prev_s(s: number): number;
    static s_next_s(s: number): number;
    numSides: number;
    numSolidSides: number;
    numRegions: number;
    numSolidRegions: number;
    numTriangles: number;
    numSolidTriangles: number;
    numBoundaryRegions: number;
    _halfedges: Int32Array;
    _triangles: Int32Array;
    _r_in_s: Int32Array;
    _t_vertex: Array<[number, number]>;
    _r_vertex: Array<[number, number]>;
    /**
     * Constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in fromDelaunator.
     */
    constructor({ numBoundaryRegions, numSolidSides, _r_vertex, _triangles, _halfedges }: {
        numBoundaryRegions: any;
        numSolidSides: any;
        _r_vertex: any;
        _triangles: any;
        _halfedges: any;
    });
    /**
     * Update internal data structures from Delaunator
     */
    update(points: [number, number][], delaunator: Delaunator): void;
    /**
     * Update internal data structures to match the input mesh.
     *
     * Use if you have updated the triangles/halfedges with Delaunator
     * and want the dual mesh to match the updated data. Note that
     * this DOES not update boundary regions or ghost elements.
     */
    _update(): void;
    /**
     * Construct a DualMesh from a Delaunator object, without any
     * additional boundary regions.
     */
    static fromDelaunator(points: Array<[number, number]>, delaunator: Delaunator): TriangleMesh;
    r_x(r: number): number;
    r_y(r: number): number;
    t_x(t: number): number;
    t_y(t: number): number;
    r_pos(out: number[], r: number): number[];
    t_pos(out: number[], t: number): number[];
    s_begin_r(s: number): number;
    s_end_r(s: number): number;
    s_inner_t(s: number): number;
    s_outer_t(s: number): number;
    s_next_s(s: number): number;
    s_prev_s(s: number): number;
    s_opposite_s(s: number): number;
    t_circulate_s(out_s: number[], t: number): number[];
    t_circulate_r(out_r: number[], t: number): number[];
    t_circulate_t(out_t: number[], t: number): number[];
    r_circulate_s(out_s: number[], r: number): number[];
    r_circulate_r(out_r: number[], r: number): number[];
    r_circulate_t(out_t: number[], r: number): number[];
    ghost_r(): number;
    s_ghost(s: number): boolean;
    r_ghost(r: number): boolean;
    t_ghost(t: number): boolean;
    s_boundary(s: number): boolean;
    r_boundary(r: number): boolean;
}
export {};
