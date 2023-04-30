import { type Point } from "./index.js";
/** Check for skinny triangles, indicating bad point selection */
export declare function checkTriangleInequality({ points, delaunator: { triangles, halfedges } }: {
    points: any;
    delaunator: {
        triangles: any;
        halfedges: any;
    };
}): void;
/**
 * Add vertices evenly along the boundary of the mesh just barely
 * inside the given boundary rectangle.
 *
 * The boundarySpacing parameter should be roughly √2 times the
 * poisson disk minDistance spacing or √½ the maxDistance spacing.
 *
 * They need to be inside and not outside so that these points can be
 * used with the poisson disk libraries I commonly use. The libraries
 * require that all points be inside the range.
 *
 * Since these points are slightly inside the boundary, the triangle
 * mesh will not fill the boundary. Generate exterior boundary points
 * if you need to fill the boundary.
 *
 * I use a *slight* curve so that the Delaunay triangulation doesn't
 * make long thin triangles along the boundary.
 */
export declare function generateInteriorBoundaryPoints({ left, top, width, height }: {
    left: any;
    top: any;
    width: any;
    height: any;
}, boundarySpacing: number): Point[];
/**
 * Add vertices evenly along the boundary of the mesh
 * outside the given boundary rectangle.
 *
 * The boundarySpacing parameter should be roughly √2 times the
 * poisson disk minDistance spacing or √½ the maxDistance spacing.
 *
 * If using poisson disc selection, the interior boundary points will
 * be to keep the points separated and the exterior boundary points
 * will be to make sure the entire map area is filled.
 */
export declare function generateExteriorBoundaryPoints({ left, top, width, height }: {
    left: any;
    top: any;
    width: any;
    height: any;
}, boundarySpacing: number): Point[];
