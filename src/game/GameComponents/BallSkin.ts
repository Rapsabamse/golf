import * as Phaser from "phaser";

type Vec3 = [number, number, number];

/** Spots sit on the corners of an icosahedron: evenly spread, about 5 in view at once. */
const PHI = (1 + Math.sqrt(5)) / 2;
const SPOTS: Vec3[] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length] as Vec3;
});

/** Spot size as a share of the ball radius. */
const SPOT_SIZE = 0.27;
/** Spots fade out over this much of the sphere's edge (z from 0 to this). */
const EDGE_FADE = 0.35;
/** Movement bigger than this in one frame is a teleport, not a roll. */
const MAX_ROLL_STEP = 80;

function shade(color: number, amount: number) {
    const r = Math.round(((color >> 16) & 0xff) * amount);
    const g = Math.round(((color >> 8) & 0xff) * amount);
    const b = Math.round((color & 0xff) * amount);
    return (r << 16) | (g << 8) | b;
}

/**
 * Draws a ball's surface on top of its base circle: spots that turn as the
 * ball travels, with fixed lighting so it reads as a rolling sphere.
 */
export class BallSkin {
    private readonly graphics: Phaser.GameObjects.Graphics;
    /** Each spot's current direction from the ball's centre (z points at the viewer). */
    private readonly spots: Vec3[] = SPOTS.map((spot) => [...spot] as Vec3);
    private lastX: number;
    private lastY: number;
    private spotColor = 0;
    /** Radius inside the outline, so the surface never paints over it. */
    private inner: number;
    private dirty = true;

    constructor(
        scene: Phaser.Scene,
        private readonly base: Phaser.GameObjects.Arc,
        private readonly radius: number,
    ) {
        this.graphics = scene.add.graphics().setDepth(base.depth);
        this.inner = radius;
        this.lastX = base.x;
        this.lastY = base.y;

        // Start each ball at a different angle so they don't look stamped out
        this.rotate(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 3);
    }

    setColor(color: number, outlineWidth: number) {
        this.spotColor = shade(color, 0.72);
        this.inner = this.radius - outlineWidth / 2;
        this.dirty = true;
    }

    /** The ball was placed somewhere new: don't roll it there. */
    jumpTo(x: number, y: number) {
        this.lastX = x;
        this.lastY = y;
    }

    /** Roll by however far the ball moved since last frame, then redraw. */
    update() {
        const dx = this.base.x - this.lastX;
        const dy = this.base.y - this.lastY;
        const distance = Math.hypot(dx, dy);

        this.lastX = this.base.x;
        this.lastY = this.base.y;

        if (distance > 0.01 && distance < MAX_ROLL_STEP) {
            // Rolling along (dx, dy) turns the ball around the axis (-dy, dx, 0)
            this.rotate(-dy / distance, dx / distance, distance / this.radius);
        }

        this.graphics
            .setPosition(this.base.x, this.base.y)
            .setScale(this.base.scale)
            .setAlpha(this.base.alpha)
            .setVisible(this.base.visible);

        if (this.dirty && this.base.visible) {
            this.draw();
            this.dirty = false;
        }
    }

    destroy() {
        this.graphics.destroy();
    }

    /** Rodrigues' rotation of every spot around a unit axis in the screen plane. */
    private rotate(axisX: number, axisY: number, angle: number) {
        const axisLength = Math.hypot(axisX, axisY) || 1;
        const ax = axisX / axisLength;
        const ay = axisY / axisLength;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        for (const spot of this.spots) {
            const [x, y, z] = spot;
            const dot = ax * x + ay * y;

            // v cosθ + (a × v) sinθ + a (a · v)(1 − cosθ), with a = (ax, ay, 0)
            let nx = x * cos + ay * z * sin + ax * dot * (1 - cos);
            let ny = y * cos - ax * z * sin + ay * dot * (1 - cos);
            let nz = z * cos + (ax * y - ay * x) * sin;

            const length = Math.hypot(nx, ny, nz);
            nx /= length;
            ny /= length;
            nz /= length;

            spot[0] = nx;
            spot[1] = ny;
            spot[2] = nz;
        }

        this.dirty = true;
    }

    private draw() {
        const g = this.graphics;
        const r = this.inner;
        g.clear();

        // Spots on the side facing us, squashed as they turn toward the edge
        for (const [x, y, z] of this.spots) {
            if (z <= 0) {
                continue;
            }

            const cx = x * r;
            const cy = y * r;
            const flat = Math.hypot(x, y);
            const outX = flat > 0.001 ? x / flat : 1;
            const outY = flat > 0.001 ? y / flat : 0;
            const size = SPOT_SIZE * r;
            const points: Phaser.Types.Math.Vector2Like[] = [];

            for (let i = 0; i < 10; i++) {
                const t = (i / 10) * Math.PI * 2;
                const across = Math.sin(t) * size;
                const along = Math.cos(t) * size * z;
                points.push({
                    x: cx + outX * along - outY * across,
                    y: cy + outY * along + outX * across,
                });
            }

            g.fillStyle(this.spotColor, Math.min(1, z / EDGE_FADE));
            this.fillShape(points);
        }

        // Shade the side away from the light (the light is up and to the left),
        // in two steps so the edge of the shadow is soft
        const shadowAngle = Math.PI / 4;

        for (const depth of [0.6, 0.2]) {
            const shadow: Phaser.Types.Math.Vector2Like[] = [];

            for (let i = 0; i <= 16; i++) {
                const t = -Math.PI / 2 + (i / 16) * Math.PI;
                shadow.push(this.inShadowFrame(Math.cos(t) * r, Math.sin(t) * r, shadowAngle));
            }

            for (let i = 16; i >= 0; i--) {
                const t = -Math.PI / 2 + (i / 16) * Math.PI;
                shadow.push(this.inShadowFrame(Math.cos(t) * r * depth, Math.sin(t) * r, shadowAngle));
            }

            g.fillStyle(0x000000, 0.13);
            this.fillShape(shadow);
        }

        // Highlight
        g.fillStyle(0xffffff, 0.35);
        g.fillCircle(-r * 0.36, -r * 0.36, r * 0.32);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(-r * 0.4, -r * 0.4, r * 0.14);
    }

    private fillShape(points: Phaser.Types.Math.Vector2Like[]) {
        const g = this.graphics;
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }

        g.closePath();
        g.fillPath();
    }

    /** Turn a point from a frame where the shadow points along +x. */
    private inShadowFrame(u: number, v: number, angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: u * cos - v * sin, y: u * sin + v * cos };
    }
}
