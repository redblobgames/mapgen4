declare class TriangleMesh {
    constructor(partialMesh: any);
    static fromDelaunator(points: number[][], delaunator: any);
    update(points: number[], delaunator: any);
    
    numSides: number;
    numSolidSides: number;
    numRegions: number;
    numSolidRegions: number;
    numTriangles: number;
    numSolidTriangles: number;
    numBoundaryRegions: number;

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
    t_circulate_r(out_s: number[], t: number): number[];
    t_circulate_t(out_s: number[], t: number): number[];
    r_circulate_s(out_s: number[], t: number): number[];
    r_circulate_r(out_s: number[], t: number): number[];
    r_circulate_t(out_s: number[], t: number): number[];

    ghost_r(): number;
    s_ghost(s: number): boolean;
    r_ghost(r: number): boolean;
    t_ghost(t: number): boolean;
    s_boundary(s: number): boolean;
    r_boundary(s: number): boolean;

    /* Internals */
    readonly _r_in_s: number[];
    readonly _halfedges: number[];
    readonly _triangles: number[];
}


export = TriangleMesh;

