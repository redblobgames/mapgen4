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
    static t_from_s(s: number): number;
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
    _s_of_r: Int32Array;
    _vertex_t: Array<[number, number]>;
    _vertex_r: Array<[number, number]>;
    _options: any;
    /**
     * Constructor takes partial mesh information and fills in the rest; the
     * partial information is generated in create.js or in fromDelaunator.
     */
    constructor({ numBoundaryRegions, numSolidSides, _vertex_r, _triangles, _halfedges }: {
        numBoundaryRegions: any;
        numSolidSides: any;
        _vertex_r: any;
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
    x_of_r(r: number): number;
    y_of_r(r: number): number;
    x_of_t(t: number): number;
    y_of_t(t: number): number;
    pos_of_r(r: number, out?: number[]): number[];
    pos_of_t(t: number, out?: number[]): number[];
    r_begin_s(s: number): number;
    r_end_s(s: number): number;
    t_inner_s(s: number): number;
    t_outer_s(s: number): number;
    s_next_s(s: number): number;
    s_prev_s(s: number): number;
    s_opposite_s(s: number): number;
    s_around_t(t: number, out_s?: number[]): number[];
    r_around_t(t: number, out_r?: number[]): number[];
    t_around_t(t: number, out_t?: number[]): number[];
    s_around_r(r: number, out_s?: number[]): number[];
    r_around_r(r: number, out_r?: number[]): number[];
    t_around_r(r: number, out_t?: number[]): number[];
    r_ghost(): number;
    is_ghost_s(s: number): boolean;
    is_ghost_r(r: number): boolean;
    is_ghost_t(t: number): boolean;
    is_boundary_s(s: number): boolean;
    is_boundary_r(r: number): boolean;
}
export {};
