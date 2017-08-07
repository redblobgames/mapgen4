// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

exports.fbm_noise = function(noise, nx, ny) {
    return 0.5 * noise.noise2D(nx, ny, 0)
        + 0.3 * noise.noise2D(nx * 2, ny * 2, 1)
        + 0.2 * noise.noise2D(nx * 4, ny * 4, 2)
        + 0.1 * noise.noise2D(nx * 8, ny * 8, 3);
};

exports.clamp = function(t, lo, hi) {
    if (t < lo) { return lo; }
    if (t > hi) { return hi; }
    return t;
};

exports.mix = function(a, b, t) {
    return a * (1.0-t) + b * t;
};

exports.smoothstep = function(a, b, t) {
    // https://en.wikipedia.org/wiki/Smoothstep
    if (t <= a) { return 0; }
    if (t >= b) { return 1; }
    t = (t - a) / (b - a);
    return (3 - 2*t) * t * t;
};
    
exports.circumcenter = function(a, b, c) {
    // https://en.wikipedia.org/wiki/Circumscribed_circle#Circumcenter_coordinates
    let ad = a[0]*a[0] + a[1]*a[1],
        bd = b[0]*b[0] + b[1]*b[1],
        cd = c[0]*c[0] + c[1]*c[1];
    let D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    let Ux = 1/D * (ad * (b[1] - c[1]) + bd * (c[1] - a[1]) + cd * (a[1] - b[1]));
    let Uy = 1/D * (ad * (c[0] - b[0]) + bd * (a[0] - c[0]) + cd * (b[0] - a[0]));
    return [Ux, Uy];
};
