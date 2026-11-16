import * as Phaser from "phaser";

/*
 * How the course looks. The map files only say where things are; this
 * draws them: putting-green turf, walls lit from the top-left with a
 * shadow on the grass, the cup with its flag, and the tee.
 */

type Point = { x: number; y: number };

/** Walls can say what they are made of with a "material" property in Tiled. */
export type Material = "rail" | "rock" | "bumper" | "bank" | "plain";

const TILE = 40;

/** Light comes from the top-left. */
const LIGHT = new Phaser.Math.Vector2(-0.55, -0.83).normalize();
const SHADOW_OFFSET = { x: 6, y: 9 };

// Layering: turf 0, stripes/tee above it, then shadows, walls, flag, balls (1000)
export const DEPTH = {
    floatShadow: -50,
    stripes: 0.5,
    tee: 0.6,
    cup: 1,
    wallShadow: 2,
    wall: 3,
    flag: 999,
};

// --- Colour helpers -------------------------------------------------------

function mix(color: number, target: number, amount: number) {
    const a = Phaser.Display.Color.IntegerToColor(color);
    const b = Phaser.Display.Color.IntegerToColor(target);

    return Phaser.Display.Color.GetColor(
        Math.round(a.red + (b.red - a.red) * amount),
        Math.round(a.green + (b.green - a.green) * amount),
        Math.round(a.blue + (b.blue - a.blue) * amount),
    );
}

const lighten = (color: number, amount: number) => mix(color, 0xffffff, amount);
const darken = (color: number, amount: number) => mix(color, 0x000000, amount);

// --- Turf -------------------------------------------------------------------

export const TURF_TEXTURE = "turf";

/**
 * A fine putting-green texture laid out like the Grass tileset (31×31 tiles
 * of 40px after a 7px margin), so the maps can use it in place of the
 * tileset image without any change.
 */
export function ensureTurfTexture(scene: Phaser.Scene) {
    if (scene.textures.exists(TURF_TEXTURE)) {
        return;
    }

    const size = 1254;
    const texture = scene.textures.createCanvas(TURF_TEXTURE, size, size);

    if (!texture) {
        return;
    }

    const context = texture.getContext();

    context.fillStyle = "#4f9a37";
    context.fillRect(0, 0, size, size);

    // Seeded so every player sees the same grass
    let seed = 1234567;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };

    // Very faint, large patches so the green isn't perfectly flat, then
    // fine blades
    for (let i = 0; i < 260; i++) {
        const light = random() > 0.5;
        context.fillStyle = light
            ? `rgba(120, 190, 80, ${0.015 + random() * 0.02})`
            : `rgba(30, 80, 25, ${0.015 + random() * 0.02})`;
        context.beginPath();
        context.arc(random() * size, random() * size, 40 + random() * 90, 0, Math.PI * 2);
        context.fill();
    }

    for (let i = 0; i < 26000; i++) {
        const light = random() > 0.45;
        context.fillStyle = light
            ? `rgba(170, 225, 120, ${0.1 + random() * 0.15})`
            : `rgba(25, 70, 20, ${0.1 + random() * 0.15})`;
        context.fillRect(random() * size, random() * size, 1 + random() * 1.5, 2 + random() * 3);
    }

    texture.refresh();
}

/**
 * Mown stripes across the grass (two tiles wide), and a shadow under the
 * whole course so it looks like it floats above the stars.
 */
export function drawCourseSurface(
    scene: Phaser.Scene,
    isGrass: (col: number, row: number) => boolean,
    columns: number,
    rows: number,
): Phaser.GameObjects.Graphics[] {
    const shadow = scene.add.graphics().setDepth(DEPTH.floatShadow);
    const stripes = scene.add.graphics().setDepth(DEPTH.stripes);

    shadow.fillStyle(0x000000, 0.55);
    stripes.fillStyle(0xffffff, 0.05);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            if (!isGrass(col, row)) {
                continue;
            }

            shadow.fillRect(col * TILE + 22, row * TILE + 30, TILE, TILE);

            if (Math.floor(col / 2) % 2 === 0) {
                stripes.fillRect(col * TILE, row * TILE, TILE, TILE);
            }
        }
    }

    return [shadow, stripes];
}

// --- Walls -------------------------------------------------------------------

function centroidOf(points: Point[]): Point {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Points moved `distance` towards the centre (a slightly smaller copy). */
function inset(points: Point[], distance: number): Point[] {
    const c = centroidOf(points);

    return points.map((p) => {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const length = Math.hypot(dx, dy) || 1;
        const step = Math.min(distance, length * 0.9);
        return { x: p.x + (dx / length) * step, y: p.y + (dy / length) * step };
    });
}

function scaleAround(points: Point[], center: Point, scale: number, offset: Point = { x: 0, y: 0 }) {
    return points.map((p) => ({
        x: center.x + (p.x - center.x) * scale + offset.x,
        y: center.y + (p.y - center.y) * scale + offset.y,
    }));
}

function fillShape(graphics: Phaser.GameObjects.Graphics, points: Point[]) {
    graphics.fillPoints(points as Phaser.Math.Vector2[], true);
}

/**
 * Light every edge by which way it faces: edges facing the light get a
 * bright line, edges facing away a dark one. Works for any convex shape.
 */
function lightEdges(
    graphics: Phaser.GameObjects.Graphics,
    points: Point[],
    color: number,
    width: number,
    isShared: (a: Point, b: Point) => boolean = () => false,
) {
    const c = centroidOf(points);
    const edge = inset(points, width / 2);

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        if (isShared(a, b)) {
            continue;
        }

        // Outward normal of this edge
        let nx = b.y - a.y;
        let ny = -(b.x - a.x);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (nx * (mid.x - c.x) + ny * (mid.y - c.y) < 0) {
            nx = -nx;
            ny = -ny;
        }
        const length = Math.hypot(nx, ny) || 1;
        const facing = (nx / length) * LIGHT.x + (ny / length) * LIGHT.y;

        if (Math.abs(facing) < 0.2) {
            continue;
        }

        const lit = facing > 0;
        graphics.lineStyle(
            width,
            lit ? lighten(color, 0.45) : darken(color, 0.35),
            Math.min(1, Math.abs(facing) + 0.2),
        );

        const ia = edge[i];
        const ib = edge[(i + 1) % edge.length];
        graphics.lineBetween(ia.x, ia.y, ib.x, ib.y);
    }
}

/**
 * Draw one wall. Returns its shadow and its body, and for bumpers a flash
 * ring that lights up when a ball hits it.
 */
export function drawWall(
    scene: Phaser.Scene,
    points: Point[],
    color: number,
    material: Material,
    /** For a piece of a longer wall: edges shared with its neighbours. */
    isShared?: (a: Point, b: Point) => boolean,
) {
    const joined = !!isShared;
    const shadow = scene.add.graphics().setDepth(DEPTH.wallShadow);
    const body = scene.add.graphics().setDepth(DEPTH.wall);

    // Soft shadow on the grass, down-right of the wall
    shadow.fillStyle(0x000000, 0.28);
    fillShape(shadow, points.map((p) => ({ x: p.x + SHADOW_OFFSET.x, y: p.y + SHADOW_OFFSET.y })));
    shadow.fillStyle(0x000000, 0.12);
    fillShape(shadow, points.map((p) => ({ x: p.x + SHADOW_OFFSET.x * 1.8, y: p.y + SHADOW_OFFSET.y * 1.8 })));

    const center = centroidOf(points);

    // Base
    body.fillStyle(color, 1);
    fillShape(body, points);

    switch (material) {
        case "rail": {
            // Wooden rail: a lighter top surface inside a darker frame
            // (pieces of a longer rail skip it, so no seams show)
            if (!joined) {
                body.fillStyle(lighten(color, 0.12), 1);
                fillShape(body, inset(points, 7));
            }
            lightEdges(body, points, color, 4, isShared);
            break;
        }

        case "rock": {
            // A raised facet catching the light
            body.fillStyle(lighten(color, 0.16), 1);
            fillShape(body, scaleAround(points, center, 0.68, { x: -3, y: -4 }));
            body.fillStyle(lighten(color, 0.3), 0.5);
            fillShape(body, scaleAround(points, center, 0.32, { x: -6, y: -8 }));
            lightEdges(body, points, color, 4);
            break;
        }

        case "bumper": {
            // Rubber ring, glossy cap, shine
            lightEdges(body, points, color, 5);
            body.fillStyle(lighten(color, 0.25), 1);
            fillShape(body, scaleAround(points, center, 0.62));
            body.fillStyle(darken(color, 0.15), 1);
            fillShape(body, scaleAround(points, center, 0.3));
            body.fillStyle(0xffffff, 0.55);
            fillShape(body, scaleAround(points, center, 0.2, { x: -radiusOf(points, center) * 0.28, y: -radiusOf(points, center) * 0.32 }));
            break;
        }

        case "bank": {
            // Glassy: a pale sheen across the top
            body.fillStyle(lighten(color, 0.3), 0.35);
            fillShape(body, scaleAround(points, center, 0.7, { x: -3, y: -4 }));
            lightEdges(body, points, color, 4);
            break;
        }

        default:
            lightEdges(body, points, color, 3, isShared);
    }

    // Crisp outline so walls read against the grass (not between the
    // pieces of a longer wall)
    body.lineStyle(2, darken(color, 0.55), 0.8);
    if (joined) {
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            if (!isShared!(a, b)) {
                body.lineBetween(a.x, a.y, b.x, b.y);
            }
        }
    } else {
        body.strokePoints(points as Phaser.Math.Vector2[], true, true);
    }

    let flash: Phaser.GameObjects.Graphics | undefined;

    if (material === "bumper") {
        flash = scene.add.graphics().setDepth(DEPTH.wall + 0.1).setAlpha(0);
        flash.setPosition(center.x, center.y);
        flash.fillStyle(0xffffff, 1);
        fillShape(flash, points.map((p) => ({ x: p.x - center.x, y: p.y - center.y })));
    }

    return { shadow, body, flash };
}

function radiusOf(points: Point[], center: Point) {
    return Math.max(...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y)));
}

/** The bumper lights up and swells for a moment when a ball hits it. */
export function flashBumper(scene: Phaser.Scene, flash: Phaser.GameObjects.Graphics) {
    scene.tweens.killTweensOf(flash);
    flash.setAlpha(0.75).setScale(1);

    scene.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.25,
        duration: 260,
        ease: "Quad.easeOut",
    });
}

// --- Tee ------------------------------------------------------------------

/** A lighter strip where players start, along the spawn line. */
export function drawTee(scene: Phaser.Scene, start: Point, end: Point) {
    const graphics = scene.add.graphics().setDepth(DEPTH.tee);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = { x: dx / length, y: dy / length };
    const across = { x: -along.y, y: along.x };

    const halfWidth = 30;
    const overhang = 30;

    const corners = [
        { x: start.x - along.x * overhang + across.x * halfWidth, y: start.y - along.y * overhang + across.y * halfWidth },
        { x: end.x + along.x * overhang + across.x * halfWidth, y: end.y + along.y * overhang + across.y * halfWidth },
        { x: end.x + along.x * overhang - across.x * halfWidth, y: end.y + along.y * overhang - across.y * halfWidth },
        { x: start.x - along.x * overhang - across.x * halfWidth, y: start.y - along.y * overhang - across.y * halfWidth },
    ];

    graphics.fillStyle(0xffffff, 0.1);
    fillShape(graphics, corners);
    graphics.lineStyle(2, 0xffffff, 0.28);
    graphics.strokePoints(corners as Phaser.Math.Vector2[], true, true);

    // Tee markers at both ends
    for (const p of [corners[0], corners[3], corners[1], corners[2]]) {
        graphics.fillStyle(0xffffff, 0.75);
        graphics.fillCircle(p.x, p.y, 5);
    }

    return graphics;
}

// --- Cup and flag ------------------------------------------------------------

const CUP_RADIUS = 15;

/** The cup: a white lip, a dark hole with depth, and a flag on a pole. */
export function drawCup(scene: Phaser.Scene, x: number, y: number) {
    const cup = scene.add.graphics().setDepth(DEPTH.cup);

    // Lip
    cup.fillStyle(0xe8efe2, 1);
    cup.fillCircle(x, y, CUP_RADIUS + 4);
    // Hole, darker towards the far (top) side for depth
    cup.fillStyle(0x0c1608, 1);
    cup.fillCircle(x, y, CUP_RADIUS);
    cup.fillStyle(0x000000, 0.6);
    cup.fillCircle(x, y - 3, CUP_RADIUS - 3);

    // Flag pole shadow on the grass
    const poleHeight = 78;
    const shadow = scene.add.graphics().setDepth(DEPTH.wallShadow);
    shadow.lineStyle(4, 0x000000, 0.25);
    shadow.lineBetween(x, y, x + 34, y + 20);
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillTriangle(x + 34, y + 20, x + 60, y + 30, x + 50, y + 8);

    // Pole
    const pole = scene.add.graphics().setDepth(DEPTH.flag);
    pole.lineStyle(4, 0xf4f6ff, 1);
    pole.lineBetween(x, y, x, y - poleHeight);
    pole.lineStyle(1.5, 0x8e9ac0, 1);
    pole.lineBetween(x + 1.5, y, x + 1.5, y - poleHeight);

    // Pennant, drawn from the pole so it can wave
    const pennant = scene.add.graphics().setDepth(DEPTH.flag).setPosition(x + 1, y - poleHeight);
    pennant.fillStyle(0xf4f6ff, 1);
    pennant.fillTriangle(0, 0, 40, 13, 0, 26);
    pennant.fillStyle(0xc9d1ea, 1);
    pennant.fillTriangle(0, 13, 40, 13, 0, 26);
    pennant.lineStyle(1.5, 0x121a35, 0.6);
    pennant.strokeTriangle(0, 0, 40, 13, 0, 26);

    const wave = scene.tweens.add({
        targets: pennant,
        scaleX: { from: 1, to: 0.82 },
        scaleY: { from: 1, to: 1.06 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
    });

    return {
        destroy() {
            wave.stop();
            cup.destroy();
            shadow.destroy();
            pole.destroy();
            pennant.destroy();
        },
    };
}

/**
 * Edges two pieces have in common, so a wall built from pieces (like the
 * ring around a cup) is drawn as one.
 */
export function findSharedEdges(pieces: Point[][]) {
    const key = (p: Point) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
    const edgeKey = (a: Point, b: Point) => [key(a), key(b)].sort().join("|");

    const counts = new Map<string, number>();

    for (const points of pieces) {
        for (let i = 0; i < points.length; i++) {
            const k = edgeKey(points[i], points[(i + 1) % points.length]);
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
    }

    return (a: Point, b: Point) => (counts.get(edgeKey(a, b)) ?? 0) > 1;
}

/** Read the "material" property set on a wall in Tiled. */
export function getMaterial(properties: unknown): Material {
    const property = (properties as { name: string; value: unknown }[] | undefined)?.find(
        (candidate) => candidate.name === "material",
    );

    const value = property?.value;

    return value === "rail" || value === "rock" || value === "bumper" || value === "bank"
        ? value
        : "plain";
}
