/*
 * From https://www.redblobgames.com/x/2502-mapgen4-overlay/
 * Copyright 2025 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Create an overlay in 2D Canvas that will be added to the 3D map render
 */

export const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 2048;
canvas.height = 2048;
ctx.fillStyle = "hsl(0 50% 50% / 0.5)";
ctx.fillRect(0, 0, 2048, 1024);
ctx.fillStyle = "hsl(150 50% 50% / 0.5)";
ctx.fillRect(0, 1024, 2048, 1024);
