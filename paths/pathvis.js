import Path from "./paths.js"
import Pose2d from "./geo/pose2d.js"
import Constants from "./robot/constants.js";

const defaultPath = `{
    "reverse": false,
    "waypoints": [
        { "x": -0, "y": 0, "heading": 0 },
        { "x": 300, "y": -200, "heading": 0 },
        { "x": 350, "y": -230, "heading": -90 }
    ]
}`;
const pixelRatio = 2;

export default class PathVisualizer {
    static initialize() {
        customElements.define("path-display", PathDisplay);
    }
}

class PathDisplay extends HTMLElement {
    constructor() {
        super();

        let shadowRoot = this.attachShadow({ mode: "open" });
        this.canvas = document.createElement("canvas");
        shadowRoot.appendChild(this.canvas);

        this.hasSetup = false;
        let setupMethod = this.setupCanvas.bind(this);
        let closestSection = this.closest("section");
        Reveal.addEventListener("ready", (() => {
            if (!this.hasSetup && closestSection.classList.contains("present")) {
                setupMethod();
            }
        }).bind(this));
        Reveal.addEventListener("slidechanged", ((event) => {
            if (!this.hasSetup && event.currentSlide == closestSection) {
                setupMethod();
            }
        }).bind(this))
    }

    setupCanvas() {
        this.hasSetup = true;

        let obj = JSON.parse(this.textContent.trim() || defaultPath);
        let waypoints = [];
        for (let wp of obj.waypoints) {
            waypoints.push(Pose2d.fromXYTheta(wp.x, wp.y, wp.heading));
        }
        let path = new Path(obj.name, waypoints);
        if (obj.reverse)
            path.reverse();
        let pathSamples = path.getOptimizedSplineSamples();

        let max = { x: -Infinity, y: -Infinity };
        let min = { x: Infinity, y: Infinity };
        for (let ps of pathSamples) {
            if (max.x < ps.translation.x) max.x = ps.translation.x;
            if (min.x > ps.translation.x) min.x = ps.translation.x;
            if (max.y < ps.translation.y) max.y = ps.translation.y;
            if (min.y > ps.translation.y) min.y = ps.translation.y;
        }

        let constants = Constants.getInstance();
        let maxPathOffset = Math.hypot(constants.drive.CenterToFront, constants.drive.CenterToSide);
        max.x += maxPathOffset;
        max.y += maxPathOffset;
        min.x -= maxPathOffset;
        min.y -= maxPathOffset;

        // Invalidate optimized spline/spline sample cache, because they are for different waypoints
        path.osplinesamps = null;
        path.osplines = null;
        for (let wp of path.waypoints) {
            wp.translation.x -= min.x;
            wp.translation.y -= min.y;
        }

        this.canvas.width = max.x - min.x;
        this.canvas.height = max.y - min.y;

        let scale = pixelRatio * Math.min(this.clientWidth / this.canvas.width, this.clientHeight / this.canvas.height);
        this.canvas.width *= scale;
        this.canvas.height *= scale;
        let ctx = this.canvas.getContext("2d");
        ctx.scale(scale, scale);

        this.canvas.style.width = (this.canvas.width / pixelRatio) + "px"
        this.canvas.style.height = (this.canvas.height / pixelRatio) + "px"

        let isPlaying =
            this.closest("section").classList.contains("present") && !this.classList.contains("fragment") && this.closest(".fragment") === null;
        let firstDrawTime = Date.now() / 1000;
        let draw = () => {
            if (!isPlaying)
                return;

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            path.draw(ctx, {
                mode: this.dataset.displayMode || "robot",
                color: this.dataset.color || "yellow",
                colors: {
                    "frontwheels": this.dataset.frontWheelColor || "yellow",
                    "backwheels": this.dataset.backWheelColor || "yellow",
                    "body": this.dataset.bodyPathColor || "transparent",
                    "body/active": this.dataset.bodyColor || "blue",
                },
                radius: Number(this.dataset.radius),
                dt: Number(this.dataset.dt),
                maxDx: Number(this.dataset.maxDx),
                maxDy: Number(this.dataset.maxDy),
                maxDTheta: Number(this.dataset.maxDtheta),
                animationTime: Number(this.dataset.animationTime),
                stopDrawingAtRobot: this.dataset.stopDrawingAtRobot,
                time: this.dataset.timing,
            }, firstDrawTime);
            requestAnimationFrame(draw);
        };
        draw();

        Reveal.addEventListener("slidechanged", ((event) => {
            if (event.currentSlide == this.parentNode && !isPlaying) {
                firstDrawTime = Date.now() / 1000;
                isPlaying = true;
                draw();
            } else if (event.currentSlide != this.parentNode) {
                isPlaying = false;
            }
        }).bind(this));

        Reveal.addEventListener("fragmentshown", ((event) => {
            if ((event.fragment === this || event.fragment.contains(this)) && !isPlaying) {
                console.log("playing");
                console.log(event.fragment.contains(this));
                console.log(this);
                firstDrawTime = Date.now() / 1000;
                isPlaying = true;
                draw();
            }
        }).bind(this));

        Reveal.addEventListener("fragmenthidden", ((event) => {
            if (event.fragment == this || event.fragment.contains(this)) {
                isPlaying = false;
            }
        }).bind(this));
    }
}