// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

/* global makeRandFloat */

'use strict';

const {mixp} = require('./util');

/**
 * Noisy edges is a variant of midpoint subdivision that keeps the lines
 * constrained to a quadrilateral. See the explanation here:
 * http://www.redblobgames.com/maps/mapgen2/noisy-edges.html
 */

/**
 * Return the noisy line from a to b, within quadrilateral a-p-b-q,
 * as an array of points, not including a.
 */
exports.recursiveSubdivision = function(level, amplitude, {a, b, p, q}, randFloat) {
    function recur(level, {a, b, p, q}) {
        if (level <= 0) { return [b]; }
        let ap = mixp([], a, p, 0.5),
            bp = mixp([], b, p, 0.5),
            aq = mixp([], a, q, 0.5),
            bq = mixp([], b, q, 0.5);

        let division = 0.5 * (1 - amplitude) + randFloat() * amplitude;
        let center = mixp([], p, q, division);
        
        let quad1 = {level, a: a, b: center, p: ap, q: aq},
            quad2 = {level, a: center, b: b, p: bp, q: bq};
        
        let results1 = recur(level-1, quad1),
            results2 = recur(level-1, quad2);

        return results1.concat(results2);
    }

    return recur(level, {a, b, p, q});
};


exports.assign_s_segments = function(mesh, levels, amplitude, randInt) {
    let s_lines = [];
    for (let s = 0; s < mesh.numSides; s++) {
        let t0 = mesh.s_inner_t(s),
            t1 = mesh.s_outer_t(s),
            r0 = mesh.s_begin_r(s),
            r1 = mesh.s_end_r(s);
        if (r0 < r1) {
            s_lines[s] = exports.recursiveSubdivision(
                mesh.s_ghost(s) ? 0 : levels,
                amplitude,
                {
                    a: mesh.t_vertex[t0],
                    b: mesh.t_vertex[t1],
                    p: mesh.r_vertex[r0],
                    q: mesh.r_vertex[r1]
                },
                makeRandFloat(randInt(0x7fff))
            );
            // construct line going the other way; since the line is a
            // half-open interval with [p1, p2, p3, ..., pn] but not
            // p0, we want to reverse all but the last element, and
            // then append p0
            let opposite = s_lines[s].slice(0, -1);
            opposite.reverse();
            opposite.push(mesh.t_vertex[t0]);
            s_lines[mesh.s_opposite_s(s)] = opposite;
        }
    }
    return s_lines;
};
