// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

new Vue({
    el: "#test",
    data: {
        param: 50
    },
    directives: {
        draw: function(canvas, binding) {
            let ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
            ctx.fillRect(10, 10, 50, 50);
        }
    }
});

