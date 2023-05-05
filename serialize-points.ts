/*
 * From https://www.redblobgames.com/maps/mapgen4b/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Serialize/deserialize point data
 */

import {type PointsData} from "./generate-points.ts";

const MAP_FLOAT_RANGE: [number, number] = [-100, 1000 + 100]; // assume spacing < 100
const UINT_RANGE: [number, number] = [0, (1 << 16) - 1];

function rescale(value: number, before: [number, number], after: [number, number]): number {
    if (value < before[0] || value > before[1]) throw "rescaling out of range";
    return (value - before[0]) / (before[1] - before[0]) * (after[1] - after[0]) + after[0];
}


export function fromPointsFile(data: Uint16Array): PointsData {
    let numExteriorBoundaryPoints = data[0];
    let numInteriorBoundaryPoints = data[1];
    let numMountainPoints = data[2];
    let points = [];
    for (let i = 3; i < data.length; i += 2) {
        let x = rescale(data[i], UINT_RANGE, MAP_FLOAT_RANGE);
        let y = rescale(data[i+1], UINT_RANGE, MAP_FLOAT_RANGE);
        points.push([x, y]);
    }
    return {
        points,
        numExteriorBoundaryPoints,
        numInteriorBoundaryPoints,
        numMountainPoints,
    };
}


export function toPointsFile(p: PointsData): Uint16Array {
    let data: number[] = [
        p.numExteriorBoundaryPoints,
        p.numInteriorBoundaryPoints,
        p.numMountainPoints
    ];
    for (let [x, y] of p.points) {
        data.push(rescale(x, MAP_FLOAT_RANGE, UINT_RANGE),
                  rescale(y, MAP_FLOAT_RANGE, UINT_RANGE));
    }

    return Uint16Array.from(data);
}
