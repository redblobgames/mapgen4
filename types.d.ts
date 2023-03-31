/* I use the TriangleMesh from my dual mesh library, but I add fields to it,
 * so I'm declaring that here for type checking purposes. */

import TriangleMesh from "./dual-mesh/index.ts";

export class Mesh extends TriangleMesh {
    length_s: Float32Array; /* indexed on s */
}
