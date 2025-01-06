/*
 * From https://www.redblobgames.com/x/2502-mapgen4-overlay/
 * Copyright 2025 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Create an overlay in 2D Canvas that will be added to the 3D map render.
 *
 * After drawing on the canvas, set the dirty flag so that render.ts knows to
 * copy from from the canvas to a gpu texture.
 */

let state = {
    canvas: document.createElement('canvas'),
};
export default state;

state.canvas.width = state.canvas.height = 2028;
state.canvas.style.background = "#969";
document.body.append("Overlay:", state.canvas);
