import TriangleMesh from "./index.js";
type Points = Array<[number, number]>;
/**
 * Build a dual mesh from points, with ghost triangles around the exterior.
 *
 * Options:
 *   - To have equally spaced points added around a rectangular boundary,
 *     pass in a boundary with the rectangle size and the boundary spacing.
 *     If using Poisson disc points, I recommend √2 times the spacing used
 *     for Poisson disc.
 *
 * Phases:
 *   - Add boundary points
 *   - Add your own set of points
 *   - Add Poisson disc points
 *
 * The mesh generator runs some sanity checks but does not correct the
 * generated points.
 *
 * Examples:
 *
 * Build a mesh with poisson disc points and a boundary:
 *
 * TODO:
 * new MeshBuilder(options)
 *    .appendPoints(pointsArray)
 *    .create()
 */
export default class MeshBuilder {
    points: Points;
    numBoundaryRegions: number;
    options: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    constructor(options?: any);
    /** pass in a function to return a new points array; note that
     * if there are existing boundary points, they should be preserved */
    replacePointsFn(adder: (points: Points) => Points): this;
    /** pass in an array of new points to append to the points array */
    appendPoints(newPoints: Points): this;
    /** Points will be [x, y] */
    getNonBoundaryPoints(): Points;
    /** (used for more advanced mixing of different mesh types) */
    clearNonBoundaryPoints(): this;
    /** Build and return a TriangleMesh */
    create(runChecks?: boolean): TriangleMesh;
}
export {};
