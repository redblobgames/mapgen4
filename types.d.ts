/* I use the TriangleMesh from my dual mesh library, but I add fields to it,
 * so I'm declaring that here for type checking purposes. */

import TriangleMesh from '@redblobgames/dual-mesh';

export class Mesh extends TriangleMesh {
    s_length: Float32Array; /* indexed on s */
}
