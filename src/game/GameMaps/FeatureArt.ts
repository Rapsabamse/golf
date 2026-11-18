import * as Phaser from "phaser";

/**
 * How the course pieces from CourseFeatures.ts look. Everything that never
 * moves (sand, slopes, ramps, tunnels, tracks) is drawn below the walls, so
 * CourseBake draws it once with the rest of the course. Windmill blades and
 * sliding blocks move, so they're drawn above the walls and kept live.
 */

type Point = { x: number; y: number };

/** Layers for the pieces (the course itself is in CourseArt's DEPTH). */
export const FEATURE_DEPTH = {
    slope: 0.52,
    sand: 0.54,
    track: 0.56,
    ramp: 0.58,
    tunnel: 0.9,
    // Above the walls: these move, so they aren't baked
    moverShadow: 4,
    mover: 4.1,
    bladeShadow: 4.2,
    blades: 4.3,
    hub: 4.4,
};

const SAND = 0xe3c98a;
const SAND_DARK = 0xc3a464;
const SAND_LIGHT = 0xf3e2b0;
const WOOD = 0xb9824a;
const WOOD_DARK = 0x8a5a2c;
const STONE = 0x8e8a99;
const SAIL = 0xf2ece0;
const SAIL_FRAME = 0x7a4b2a;
const HAZARD = 0xf2c230;
const TUNNEL_RIM = 0xa77bff;

function fill(graphics: Phaser.GameObjects.Graphics, points: Point[]) {
    graphics.fillPoints(points as Phaser.Math.Vector2[], true);
}

/** A cheap, repeatable random number from a position (for grain and speckles). */
function hash(x: number, y: number) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function boundsOf(points: Point[]) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
    };
}

export function pointInPolygon(x: number, y: number, points: Point[]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if (
            a.y > y !== b.y > y &&
            x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** A sand bunker: soft rim, raked lines, grains. */
export function drawSand(scene: Phaser.Scene, points: Point[]) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.sand);

    // Darker rim where the grass meets the sand, then the sand
    g.fillStyle(SAND_DARK, 1);
    fill(g, points);
    const c = centre(points);
    g.fillStyle(SAND, 1);
    fill(g, shrink(points, c, 6));
    g.fillStyle(SAND_LIGHT, 0.55);
    fill(g, shrink(points, c, 14).map((p) => ({ x: p.x - 4, y: p.y - 5 })));

    // Raked lines and grains, kept inside the bunker
    const box = boundsOf(points);
    const inner = shrink(points, c, 12);

    for (let y = box.top + 10; y < box.bottom; y += 14) {
        for (let x = box.left; x < box.right; x += 6) {
            const wobble = Math.sin(x / 26 + y / 9) * 3;
            if (pointInPolygon(x, y + wobble, inner)) {
                g.fillStyle(SAND_DARK, 0.35);
                g.fillRect(x, y + wobble, 6, 1.6);
            }
        }
    }

    for (let y = box.top; y < box.bottom; y += 7) {
        for (let x = box.left; x < box.right; x += 7) {
            const r = hash(x, y);
            const px = x + r * 7;
            const py = y + hash(y, x) * 7;
            if (r > 0.55 && pointInPolygon(px, py, inner)) {
                g.fillStyle(r > 0.8 ? 0xffffff : SAND_DARK, r > 0.8 ? 0.35 : 0.4);
                g.fillCircle(px, py, 1.2);
            }
        }
    }

    return g;
}

/**
 * A slope: the grass shaded light-to-dark downhill, with faint chevrons
 * pointing the way a ball will curve.
 */
export function drawSlope(
    scene: Phaser.Scene,
    points: Point[],
    direction: Point,
    strength: number,
) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.slope);
    const box = boundsOf(points);

    // Shading in bands across the slope: lighter uphill, darker downhill
    const along = (p: Point) => p.x * direction.x + p.y * direction.y;
    const proj = points.map(along);
    const low = Math.min(...proj);
    const high = Math.max(...proj);
    const bands = 10;
    const step = 6;

    for (let y = box.top; y < box.bottom; y += step) {
        for (let x = box.left; x < box.right; x += step) {
            const cx = x + step / 2;
            const cy = y + step / 2;
            if (!pointInPolygon(cx, cy, points)) {
                continue;
            }
            const t = (along({ x: cx, y: cy }) - low) / Math.max(1, high - low);
            const band = Math.floor(t * bands) / bands;
            g.fillStyle(band < 0.5 ? 0xffffff : 0x000000, Math.abs(band - 0.5) * 0.26);
            g.fillRect(x, y, step, step);
        }
    }

    // Chevrons pointing downhill, more of them on steeper slopes
    const across = { x: -direction.y, y: direction.x };
    const spacing = strength > 0.15 ? 70 : 95;
    const size = 13;

    for (let y = box.top + spacing / 2; y < box.bottom; y += spacing) {
        for (let x = box.left + spacing / 2; x < box.right; x += spacing) {
            const offset = (Math.floor(y / spacing) % 2) * (spacing / 2);
            const px = x + offset;
            if (!pointInPolygon(px, y, shrink(points, centre(points), 16))) {
                continue;
            }
            const tip = { x: px + direction.x * size, y: y + direction.y * size };
            const left = {
                x: px - direction.x * size * 0.2 + across.x * size,
                y: y - direction.y * size * 0.2 + across.y * size,
            };
            const right = {
                x: px - direction.x * size * 0.2 - across.x * size,
                y: y - direction.y * size * 0.2 - across.y * size,
            };
            g.lineStyle(3.5, 0xffffff, 0.32);
            g.lineBetween(left.x, left.y, tip.x, tip.y);
            g.lineBetween(right.x, right.y, tip.x, tip.y);
        }
    }

    return g;
}

/**
 * A wooden ramp: planks across it, darker toward the bottom, a lip at the
 * top where balls take off, and arrows up the middle.
 */
export function drawRamp(scene: Phaser.Scene, points: Point[], direction: Point) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.ramp);
    const box = boundsOf(points);
    const along = (p: Point) => p.x * direction.x + p.y * direction.y;
    const proj = points.map(along);
    const low = Math.min(...proj);
    const high = Math.max(...proj);

    // Shadow cast by the raised top end
    g.fillStyle(0x000000, 0.25);
    fill(g, points.map((p) => ({ x: p.x + 6, y: p.y + 9 })));

    g.fillStyle(WOOD_DARK, 1);
    fill(g, points);

    // Planks, lighter as the ramp rises toward the light
    const step = 5;
    for (let y = box.top; y < box.bottom; y += step) {
        for (let x = box.left; x < box.right; x += step) {
            const cx = x + step / 2;
            const cy = y + step / 2;
            if (!pointInPolygon(cx, cy, shrink(points, centre(points), 4))) {
                continue;
            }
            const t = (along({ x: cx, y: cy }) - low) / Math.max(1, high - low);
            const plank = Math.floor(t * 9);
            const shade = 0.75 + t * 0.35 + (plank % 2) * 0.05;
            g.fillStyle(scaleColor(WOOD, shade), 1);
            g.fillRect(x, y, step, step);
        }
    }

    // Arrows up the ramp
    const c = centre(points);
    const across = { x: -direction.y, y: direction.x };
    for (const k of [-0.25, 0.1]) {
        const length = high - low;
        const base = { x: c.x + direction.x * length * k, y: c.y + direction.y * length * k };
        const tip = { x: base.x + direction.x * 22, y: base.y + direction.y * 22 };
        g.fillStyle(0xffffff, 0.6);
        g.fillTriangle(
            tip.x,
            tip.y,
            base.x + across.x * 16,
            base.y + across.y * 16,
            base.x - across.x * 16,
            base.y - across.y * 16,
        );
    }

    // The lip along the top edge
    const top = points.filter((p) => along(p) > high - 2);
    if (top.length >= 2) {
        g.lineStyle(6, 0xf6d7a6, 1);
        g.lineBetween(top[0].x, top[0].y, top[1].x, top[1].y);
    }

    return g;
}

/**
 * A tunnel: the entrance is a dark hole in a stone ring; the exit is a
 * pipe mouth with an arrow out. A dashed line joins them faintly.
 */
export function drawTunnel(
    scene: Phaser.Scene,
    entrance: Point,
    exit: Point,
    exitDirection: Point,
    radius: number,
) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.tunnel);

    // Faint path underground
    const dx = exit.x - entrance.x;
    const dy = exit.y - entrance.y;
    const length = Math.hypot(dx, dy);
    for (let d = radius + 10; d < length - radius - 10; d += 22) {
        g.fillStyle(0x000000, 0.12);
        g.fillCircle(entrance.x + (dx / length) * d, entrance.y + (dy / length) * d, 3);
    }

    for (const [p, isExit] of [
        [entrance, false],
        [exit, true],
    ] as const) {
        // Shadow, then a ring of stone blocks (the cup is a plain white lip)
        g.fillStyle(0x000000, 0.3);
        g.fillCircle(p.x + 5, p.y + 8, radius + 13);

        const outer = radius + 13;
        const blocks = 12;
        for (let i = 0; i < blocks; i++) {
            const a0 = (i / blocks) * Math.PI * 2 + 0.04;
            const a1 = ((i + 1) / blocks) * Math.PI * 2 - 0.04;
            const shade = i % 2 === 0 ? STONE : 0xa29eae;
            const pts: Point[] = [];
            for (let k = 0; k <= 4; k++) {
                const a = a0 + ((a1 - a0) * k) / 4;
                pts.push({ x: p.x + Math.cos(a) * outer, y: p.y + Math.sin(a) * outer });
            }
            for (let k = 4; k >= 0; k--) {
                const a = a0 + ((a1 - a0) * k) / 4;
                pts.push({ x: p.x + Math.cos(a) * (radius + 2), y: p.y + Math.sin(a) * (radius + 2) });
            }
            g.fillStyle(shade, 1);
            fill(g, pts);
        }

        // Violet rim and a deep hole
        g.fillStyle(TUNNEL_RIM, 1);
        g.fillCircle(p.x, p.y, radius + 3);
        g.fillStyle(0x07080f, 1);
        g.fillCircle(p.x, p.y, radius);
        g.fillStyle(TUNNEL_RIM, 0.25);
        g.fillCircle(p.x, p.y + 4, radius - 6);
        g.fillStyle(0x000000, 0.85);
        g.fillCircle(p.x, p.y - 2, radius - 7);

        if (isExit) {
            const across = { x: -exitDirection.y, y: exitDirection.x };
            const base = { x: p.x + exitDirection.x * (outer + 6), y: p.y + exitDirection.y * (outer + 6) };
            const tip = { x: base.x + exitDirection.x * 18, y: base.y + exitDirection.y * 18 };
            g.fillStyle(TUNNEL_RIM, 0.95);
            g.fillTriangle(
                tip.x,
                tip.y,
                base.x + across.x * 12,
                base.y + across.y * 12,
                base.x - across.x * 12,
                base.y - across.y * 12,
            );
        }
    }

    return g;
}

/** The groove a sliding block runs in. */
export function drawTrack(scene: Phaser.Scene, from: Point, to: Point, width: number) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.track);
    g.lineStyle(width + 8, 0x000000, 0.18);
    g.lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(4, 0x000000, 0.25);
    g.lineBetween(from.x, from.y, to.x, to.y);
    return g;
}

/**
 * A sliding block, drawn around (0, 0) so it can be moved by position.
 * Yellow and black stripes say "this moves".
 */
export function drawMover(scene: Phaser.Scene, width: number, height: number) {
    const shadow = scene.add.graphics().setDepth(FEATURE_DEPTH.moverShadow);
    shadow.fillStyle(0x000000, 0.3);
    shadow.fillRoundedRect(-width / 2 + 6, -height / 2 + 9, width, height, 8);

    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.mover);
    g.fillStyle(0x2a2a33, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 8);

    // Yellow and black bands, like a level-crossing barrier
    const inset = 6;
    const w = width - inset * 2;
    const h = height - inset * 2;
    const vertical = width >= height;
    const length = vertical ? w : h;
    const bands = Math.max(3, Math.round(length / 16) | 1);
    const band = length / bands;
    for (let i = 0; i < bands; i++) {
        g.fillStyle(i % 2 === 0 ? HAZARD : 0x23232b, 1);
        if (vertical) {
            g.fillRect(-w / 2 + i * band, -h / 2, band + 0.5, h);
        } else {
            g.fillRect(-w / 2, -h / 2 + i * band, w, band + 0.5);
        }
    }

    g.lineStyle(3, 0xffffff, 0.35);
    g.strokeRoundedRect(-width / 2 + 1.5, -height / 2 + 1.5, width - 3, height - 3, 7);

    return { shadow, body: g };
}

/** One windmill sail, drawn pointing right from (0, 0) so it can be rotated. */
export function drawSail(scene: Phaser.Scene, length: number, width: number, start: number) {
    const shadow = scene.add.graphics().setDepth(FEATURE_DEPTH.bladeShadow);
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRect(start, -width / 2, length, width);

    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.blades);
    // Spar
    g.fillStyle(SAIL_FRAME, 1);
    g.fillRect(start - 4, -5, length + 4, 10);
    // Lattice sail
    g.fillStyle(SAIL, 1);
    g.fillRect(start + 6, -width / 2, length - 6, width);
    g.lineStyle(2, SAIL_FRAME, 0.8);
    g.strokeRect(start + 6, -width / 2, length - 6, width);
    for (let x = start + 18; x < start + length; x += 14) {
        g.lineBetween(x, -width / 2, x, width / 2);
    }
    g.lineBetween(start + 6, 0, start + length, 0);

    return { shadow, body: g };
}

/** The windmill's hub: a stone cap with a wooden boss. */
export function drawHub(scene: Phaser.Scene, x: number, y: number, radius: number) {
    const g = scene.add.graphics().setDepth(FEATURE_DEPTH.hub);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(x + 5, y + 8, radius);
    g.fillStyle(0xa04a38, 1);
    g.fillCircle(x, y, radius);
    g.fillStyle(0xc8634c, 1);
    g.fillCircle(x - 3, y - 4, radius * 0.72);
    g.fillStyle(WOOD_DARK, 1);
    g.fillCircle(x, y, radius * 0.38);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(x - radius * 0.35, y - radius * 0.4, radius * 0.18);
    return g;
}

function centre(points: Point[]): Point {
    const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

function shrink(points: Point[], c: Point, distance: number): Point[] {
    return points.map((p) => {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const length = Math.hypot(dx, dy) || 1;
        const step = Math.min(distance, length * 0.9);
        return { x: p.x + (dx / length) * step, y: p.y + (dy / length) * step };
    });
}

function scaleColor(color: number, amount: number) {
    const r = Math.min(255, Math.round(((color >> 16) & 0xff) * amount));
    const g = Math.min(255, Math.round(((color >> 8) & 0xff) * amount));
    const b = Math.min(255, Math.round((color & 0xff) * amount));
    return (r << 16) | (g << 8) | b;
}
