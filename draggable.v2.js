/*
 * From https://www.redblobgames.com/x/1845-draggable/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

class Draggable {
    /** Props should be an object:
     *
     * el: HTMLElement - required - the element where the drag handlers are attached
     * reference: HTMLElement - defaults to el - the element where positions are calculated
     *
     * The reference element should not move during the drag operation.
     *
     * start(event) - optional - called when drag operation starts
     * drag(event) - optional - called each time mouse/finger moves
     * end(event) - optional - called when the drag operation ends
     *
     * event.raw will have the raw (native) event
     *
     * TODO: document (coords, uninstall, mouse_button, touch_identifier)
     */
    constructor(props) {
        this.reference = props.el;
        Object.assign(this, props);

        let mouse_cleanup = () => null;
        const mouseDown = (event) => {
            if (event.button != 0) { return; /* don't trap right click */ }
            mouse_cleanup(); // in case a drag is already in progress
            const rect = this.reference.getBoundingClientRect();
            let operation = Object.create(this);
            operation.mouse_button = event.button;
            operation.raw = event;
            operation.start(operation.coords(rect, event));
            
            function mouseMove(event) {
                operation.raw = event;
                operation.drag(operation.coords(rect, event));
                event.preventDefault();
                event.stopPropagation();
            }

            function mouseUp(event) {
                operation.raw = event;
                operation.end(operation.coords(rect, event));
                mouse_cleanup();
                event.preventDefault();
                event.stopPropagation();
            }

            mouse_cleanup = () => {
                window.removeEventListener('mousemove', mouseMove);
                window.removeEventListener('mouseup', mouseUp);
                mouse_cleanup = () => null;
            };

            window.addEventListener('mousemove', mouseMove);
            window.addEventListener('mouseup', mouseUp);
            event.preventDefault();
            event.stopPropagation();
        };

        let touch_begin = [];
        const touchEvent = (event) => {
            const rect = this.reference.getBoundingClientRect();
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                let current = this.coords(rect, touch);
                current.raw = touch;
                switch (event.type) {
                case 'touchstart':
                    touch_begin[touch.identifier] = Object.create(this);
                    touch_begin[touch.identifier].touch_identifier = touch.identifier;
                    touch_begin[touch.identifier].start(current);
                    break;
                case 'touchmove':
                    touch_begin[touch.identifier].drag(current);
                    break;
                case 'touchend':
                    touch_begin[touch.identifier].end(current);
                    touch_begin[touch.identifier] = null;
                    break;
                }
            }
            event.preventDefault();
            event.stopPropagation();
        };

        this.el.style.touchAction = 'none';
        this.el.addEventListener('mousedown', mouseDown);
        this.el.addEventListener('touchstart', touchEvent);
        this.el.addEventListener('touchmove', touchEvent);
        this.el.addEventListener('touchend', touchEvent);

        this.uninstall = function() {
            this.el.style.touchAction = '';
            this.el.removeEventListener('mousedown', mouseDown);
            this.el.removeEventListener('touchstart', touchEvent);
            this.el.removeEventListener('touchmove', touchEvent);
            this.el.removeEventListener('touchend', touchEvent);
            mouse_cleanup();
        };
        
    }

    // NOTE: this doesn't take into account css transforms
    // <https://bugzilla.mozilla.org/show_bug.cgi?id=972041>
    coords(rect, event) {
        let coords = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        const svg = this.reference instanceof SVGSVGElement? this.reference : this.reference.ownerSVGElement;
        if (svg) {
            // NOTE: svg.getScreenCTM already factors in the bounding rect
            // so there's no need to subtract rect, or even call getBoundingClientRect
            let point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            coords = point.matrixTransform(svg.getScreenCTM().inverse());
        }
        return coords;
    }

    start(_event) {}
    drag(_event) {}
    end(_event) {}
}
