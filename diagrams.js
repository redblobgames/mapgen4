// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

const TriangleMesh = require('@redblobgames/triangle-mesh');
const create_mesh = require('@redblobgames/triangle-mesh/create');

const triangle_center_radius = 4;
const polygon_center_radius = 5;

function diagram(canvas, mesh, layers) {
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width/1000, canvas.height/1000);
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.translate(50, 50); ctx.scale(0.9, 0.9);
    ctx.fillStyle = "hsl(0, 0%, 75%)";
    ctx.fillRect(0, 0, 1000, 1000);

    for (let layer of layers) {
        switch (layer) {
        case 'triangle-edges':
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1.0;
            for (let e = 0; e < mesh.num_solid_edges; e++) {
                let v0 = mesh.e_to_begin_v(e);
                let v1 = mesh.e_to_end_v(e);
                ctx.beginPath();
                ctx.moveTo(mesh.vertices[v0][0], mesh.vertices[v0][1]);
                ctx.lineTo(mesh.vertices[v1][0], mesh.vertices[v1][1]);
                ctx.stroke();
            }
            break;

        case 'polygon-edges':
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2.0;
            for (let e = 0; e < mesh.num_edges; e++) {
                let v0 = mesh.e_to_begin_v(e);
                let v1 = mesh.e_to_end_v(e);
                let t0 = TriangleMesh.e_to_t(e);
                let t1 = TriangleMesh.e_to_t(mesh.opposites[e]);
                if (t0 > t1) {
                    ctx.beginPath();
                    ctx.moveTo(mesh.centers[t0][0], mesh.centers[t0][1]);
                    ctx.lineTo(mesh.centers[t1][0], mesh.centers[t1][1]);
                    ctx.stroke();
                }
            }
            break;
            
        case 'triangle-centers':
            ctx.fillStyle = "blue";
            ctx.strokeStyle = "hsl(0,0%,75%)";
            ctx.lineWidth = 3.0;
            for (let t = 0; t < mesh.num_solid_triangles; t++) {
                ctx.beginPath();
                ctx.arc(mesh.centers[t][0], mesh.centers[t][1], triangle_center_radius, 0, 2*Math.PI);
                ctx.stroke();
                ctx.fill();
            }
            break;
            
        case 'polygon-centers':
            ctx.fillStyle = "red";
            ctx.strokeStyle = "hsl(0,0%,75%)";
            ctx.lineWidth = 3.0;
            for (let v = 0; v < mesh.num_solid_vertices; v++) {
                ctx.beginPath();
                ctx.arc(mesh.vertices[v][0], mesh.vertices[v][1], polygon_center_radius, 0, 2*Math.PI);
                ctx.stroke();
                ctx.fill();
            }
            break;

        default:
            console.log('UNKNOWN', layer);
        }
    }
    
    ctx.restore();
}

new Vue({
    el: "#diagram-polygon-centers",
    computed: {
        mesh: function() { return new TriangleMesh(create_mesh(75.0)); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh, ['polygon-centers']);
        }
    }
});

new Vue({
    el: "#diagram-delaunay",
    computed: {
        mesh: function() { return new TriangleMesh(create_mesh(75.0)); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh, ['triangle-edges', 'polygon-centers']);
        }
    }
});

new Vue({
    el: "#diagram-triangle-centers",
    data: {
        param: 75.0
    },
    computed: {
        mesh: function() { return new TriangleMesh(create_mesh(75.0)); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh, ['triangle-edges', 'polygon-centers', 'triangle-centers']);
        }
    }
});

new Vue({
    el: "#diagram-dual-mesh",
    data: {
        param: 75.0
    },
    computed: {
        mesh: function() { return new TriangleMesh(create_mesh(75.0)); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh, ['triangle-edges', 'polygon-edges', 'triangle-centers', 'polygon-centers']);
        }
    }
});
