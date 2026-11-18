import * as Phaser from "phaser";
import { MAX_HIGHLIGHT_POINTS } from "../../../server/types/types";

/** Under the aim line (99) and the balls (1000), over the course. */
const TRAIL_DEPTH = 50;
/** A new point once the ball has moved this far from the last one. */
const MIN_POINT_DISTANCE = 6;
/** Dots this far apart while the ball is in the air. */
const AIR_DOT_SPACING = 16;
/**
 * The host's result can put a ball a little away from where this screen's
 * copy stopped it. Close enough: the line is carried on to it. Further
 * away, joining them would draw a line the ball never took.
 */
const MAX_END_CORRECTION = 60;

const OUTLINE_WIDTH = 5;
const OUTLINE_ALPHA = 0.15;
const LINE_WIDTH = 3;
const LINE_ALPHA = 0.65;
const DOT_RADIUS = 2.8;

interface TrailPiece {
    /** In the air: drawn as dots, since it didn't roll along the ground. */
    air: boolean;
    points: Phaser.Math.Vector2[];
}

interface Trail {
    color: number;
    pieces: TrailPiece[];
}

/**
 * The path each ball took on the last shot, in its player's colour. The
 * lines stay up while everyone plans the next shot and clear when it's hit.
 */
export class ShotTrails {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private trails = new Map<string, Trail>();
    private dirty = false;

    constructor(scene: Phaser.Scene) {
        this.graphics = scene.add.graphics().setDepth(TRAIL_DEPTH);
    }

    /** Where a ball is now, on one physics step of a shot. */
    record(id: string, x: number, y: number, color: number, air: boolean) {
        let trail = this.trails.get(id);

        if (!trail) {
            trail = { color, pieces: [] };
            this.trails.set(id, trail);
        }

        trail.color = color;

        const piece = trail.pieces[trail.pieces.length - 1];
        const last = piece?.points[piece.points.length - 1];

        if (piece && last && piece.air === air) {
            if (Phaser.Math.Distance.Between(last.x, last.y, x, y) < MIN_POINT_DISTANCE) {
                return;
            }
            piece.points.push(new Phaser.Math.Vector2(x, y));
        } else {
            // Took off or landed: carry on from the same spot, drawn the
            // other way
            const points = last ? [last.clone()] : [];
            points.push(new Phaser.Math.Vector2(x, y));
            trail.pieces.push({ air, points });
        }

        this.dirty = true;
    }

    /** Went through a tunnel: the line picks up again at the exit. */
    breakTrail(id: string) {
        const trail = this.trails.get(id);
        if (trail && trail.pieces.length > 0) {
            trail.pieces.push({ air: false, points: [] });
        }
    }

    /** The host's result put the ball here: end the line on it. */
    finish(id: string, x: number, y: number) {
        const trail = this.trails.get(id);
        const piece = trail?.pieces[trail.pieces.length - 1];
        const last = piece?.points[piece.points.length - 1];

        if (!piece || !last) {
            return;
        }

        const distance = Phaser.Math.Distance.Between(last.x, last.y, x, y);
        if (distance > 0.5 && distance <= MAX_END_CORRECTION) {
            piece.points.push(new Phaser.Math.Vector2(x, y));
            this.dirty = true;
        }
    }

    /**
     * This shot's path as x, y, kind triples for the shot of the hole (kind
     * 0: rolled here, 1: flew here, 2: came out of a tunnel here), ending
     * at `end` (the cup). Thinned to what the server accepts.
     */
    getPath(id: string, end?: { x: number; y: number }): number[] {
        const points: [number, number, number][] = [];
        let afterTunnel = false;

        for (const piece of this.trails.get(id)?.pieces ?? []) {
            if (piece.points.length === 0) {
                afterTunnel = points.length > 0;
                continue;
            }

            piece.points.forEach((point, index) => {
                const previous = points[points.length - 1];

                // A new piece starts on the last one's final point
                if (
                    index === 0 &&
                    !afterTunnel &&
                    previous &&
                    previous[0] === Math.round(point.x) &&
                    previous[1] === Math.round(point.y)
                ) {
                    return;
                }

                const kind =
                    index === 0 && afterTunnel ? 2 : piece.air ? 1 : 0;
                points.push([Math.round(point.x), Math.round(point.y), kind]);
            });

            afterTunnel = false;
        }

        if (end && points.length > 0) {
            points.push([Math.round(end.x), Math.round(end.y), 0]);
        }

        return thin(points).flat();
    }

    remove(id: string) {
        if (this.trails.delete(id)) {
            this.dirty = true;
        }
    }

    clear() {
        this.trails.clear();
        this.graphics.clear();
        this.dirty = false;
    }

    /** Redraw, only when a line has grown since the last frame. */
    update() {
        if (!this.dirty) {
            return;
        }
        this.dirty = false;

        const g = this.graphics;
        g.clear();

        // A soft dark edge first, so light colours show up on the grass
        for (const trail of this.trails.values()) {
            for (const piece of trail.pieces) {
                if (!piece.air) {
                    this.strokePath(g, piece.points, OUTLINE_WIDTH, 0x000000, OUTLINE_ALPHA);
                }
            }
        }

        for (const trail of this.trails.values()) {
            for (const piece of trail.pieces) {
                if (piece.air) {
                    this.drawDots(g, piece.points, trail.color);
                } else {
                    this.strokePath(g, piece.points, LINE_WIDTH, trail.color, LINE_ALPHA);
                }
            }
        }
    }

    destroy() {
        this.graphics.destroy();
        this.trails.clear();
    }

    private strokePath(
        g: Phaser.GameObjects.Graphics,
        points: Phaser.Math.Vector2[],
        width: number,
        color: number,
        alpha: number,
    ) {
        if (points.length < 2) {
            return;
        }

        g.lineStyle(width, color, alpha);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }
        g.strokePath();
    }

    /** Evenly spaced dots along the path. */
    private drawDots(
        g: Phaser.GameObjects.Graphics,
        points: Phaser.Math.Vector2[],
        color: number,
    ) {
        g.fillStyle(color, LINE_ALPHA);
        g.lineStyle(1.5, 0x000000, OUTLINE_ALPHA);

        let untilNext = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const length = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
            let along = untilNext;

            while (along <= length) {
                const t = length === 0 ? 0 : along / length;
                const x = a.x + (b.x - a.x) * t;
                const y = a.y + (b.y - a.y) * t;
                g.fillCircle(x, y, DOT_RADIUS);
                g.strokeCircle(x, y, DOT_RADIUS);
                along += AIR_DOT_SPACING;
            }

            untilNext = along - length;
        }
    }
}

/**
 * Keep every few points so a long shot fits in a message. Points where the
 * ball took off, landed or left a tunnel are always kept.
 */
function thin(points: [number, number, number][]): [number, number, number][] {
    for (let step = 1; ; step++) {
        const kept = points.filter(
            (point, index) =>
                index === 0 ||
                index === points.length - 1 ||
                index % step === 0 ||
                point[2] !== points[index + 1]?.[2] ||
                point[2] !== points[index - 1]?.[2],
        );

        if (kept.length <= MAX_HIGHLIGHT_POINTS || step > points.length) {
            return kept.slice(0, MAX_HIGHLIGHT_POINTS);
        }
    }
}
