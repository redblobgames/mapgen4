// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>


exports.assign_t_downslope_t = function(mesh, t_elevation) {
    let t_downslope_t = new Array(mesh.num_triangles);
    let t_out = [];
    for (let t1 = 0; t1 < mesh.num_triangles; t1++) {
        mesh.t_circulate_t(t_out, t1);
        let lowest_t = t1;
        for (let t2 of t_out) {
            if (t_elevation[t2] < t_elevation[lowest_t]) {
                lowest_t = t2;
            }
        }
        t_downslope_t[t1] = lowest_t;
    }
    return t_downslope_t;
};
