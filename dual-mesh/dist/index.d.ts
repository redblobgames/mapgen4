export type Point = [number, number];
export type Delaunator = {
    triangles: Int32Array;
    halfedges: Int32Array;
};
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
 * A side from p-->q will have a pair q-->p, at index
 * s_opposite_s. It will be -1 if the side doesn't have a pair.
 * Use addGhostStructure() to add ghost pairs to all sides.
 */
export declare class TriangleMesh {
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
     * Constructor takes partial mesh information from Delaunator and
     * constructs the rest.
     */
    constructor(init: MeshInitializer | TriangleMesh);
    /**
     * Update internal data structures from Delaunator
     */
    update(init: MeshInitializer): void;
    /**
     * Update internal data structures to match the input mesh.
     *
     * Use if you have updated the triangles/halfedges with Delaunator
     * and want the dual mesh to match the updated data. Note that
     * this DOES not update boundary regions or ghost elements.
     */
    _update(): void;
    /**
     * Construct ghost elements to complete the graph.
     */
    static addGhostStructure(init: MeshInitializer): MeshInitializer;
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
    s_around_t(t: number, s_out?: number[]): number[];
    r_around_t(t: number, r_out?: number[]): number[];
    t_around_t(t: number, t_out?: number[]): number[];
    s_around_r(r: number, s_out?: number[]): number[];
    r_around_r(r: number, r_out?: number[]): number[];
    t_around_r(r: number, t_out?: number[]): number[];
    r_ghost(): number;
    is_ghost_s(s: number): boolean;
    is_ghost_r(r: number): boolean;
    is_ghost_t(t: number): boolean;
    is_boundary_s(s: number): boolean;
    is_boundary_r(r: number): boolean;
}
