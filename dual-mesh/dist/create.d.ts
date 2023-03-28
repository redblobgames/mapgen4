import TriangleMesh from "./index.js";
/**
 * Build a dual mesh from points, with ghost triangles around the exterior.
 *
 * The builder assumes 0 ≤ x < 1000, 0 ≤ y < 1000
 *
 * Options:
 *   - To have equally spaced points added around the 1000x1000 boundary,
 *     pass in boundarySpacing > 0 with the spacing value. If using Poisson
 *     disc points, I recommend 1.5 times the spacing used for Poisson disc.
 *
 * Phases:
 *   - Your own set of points
 *   - Poisson disc points
 *
 * The mesh generator runs some sanity checks but does not correct the
 * generated points.
 *
 * Examples:
 *
 * Build a mesh with poisson disc points and a boundary:
 *
 * new MeshBuilder({boundarySpacing: 150})
 *    .addPoisson(Poisson, 100)
 *    .create()
 */
export default class MeshBuilder {
    points: Array<[number, number]>;
    numBoundaryRegions: number;
    /** If boundarySpacing > 0 there will be a boundary added around the 1000x1000 area */
    constructor({ boundarySpacing }?: {
        boundarySpacing?: number;
    });
    /** Points should be [x, y] */
    addPoints(newPoints: Array<[number, number]>): this;
    /** Points will be [x, y] */
    getNonBoundaryPoints(): Array<[number, number]>;
    /** (used for more advanced mixing of different mesh types) */
    clearNonBoundaryPoints(): this;
    /** Pass in the constructor from the poisson-disk-sampling module */
    addPoisson(Poisson: any, spacing: number, random?: () => number): this;
    /** Build and return a TriangleMesh */
    create(runChecks?: boolean): TriangleMesh;
}
