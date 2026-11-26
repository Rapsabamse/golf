import * as Phaser from "phaser";
import { MusicPulse } from "../GameComponents/Music";

/*
 * The floor the course stands on while music plays, one per track, seen
 * from above like the course:
 *
 *   disco      a dance floor of glass tiles, each fading between colours
 *              in its own time, with
 *              spotlight pools gliding across it and mirror-ball specks
 *              circling the room
 *   synthwave  a dark floor with a neon grid; pulses of light run along
 *              the grid lines, one cell per beat
 *   eurobeat   dark asphalt with lane markings; streaks of light race
 *              along the lanes like cars at night
 *
 * It's part of the course world (it scrolls and zooms with the course, and
 * the course's shadow falls on it), so the course sits on something instead
 * of floating in space. Everything moves smoothly and steadily: nothing
 * flashes. With no music the floor fades away to the starry sky.
 */

/** Under everything, the course's shadow included. */
const DEPTH = -100;
/** How far the floor reaches past the course on every side (world units). */
const REACH = 7000;
/** How far round the course the moving lights roam (world units). */
const ROAM = 1400;
/** Seconds for one floor to fade into another. */
const FADE = 2.5;

interface Floor {
    container: Phaser.GameObjects.Container;
    /** The tiled floor layers, kept lined up with the world. */
    tiles: Phaser.GameObjects.TileSprite[];
    weight: number;
    /** Its own beat, carried on at the last tempo while it fades out. */
    beat: number;
    /** Beats per second, from the music while it plays. */
    rate: number;
    /** Move the lights: `beat` from the music, `area` the course plus some room round it. */
    animate(beat: number, area: Phaser.Geom.Rectangle): void;
}

/** Same seed for everyone, so every player sees the same floor. */
function seededRandom(seed: number) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
}

function canvasTexture(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void,
) {
    if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, width, height);
        if (texture) {
            draw(texture.getContext());
            texture.refresh();
        }
    }
    return key;
}

/** A soft round glow, white in the middle. */
function glowTexture(scene: Phaser.Scene) {
    return canvasTexture(scene, "floor-glow", 128, 128, (context) => {
        const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        glow.addColorStop(0, "rgba(255, 255, 255, 1)");
        glow.addColorStop(0.3, "rgba(255, 255, 255, 0.45)");
        glow.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, 128, 128);
    });
}

/** A streak of light, bright at its head (the right end) and fading behind. */
function streakTexture(scene: Phaser.Scene) {
    return canvasTexture(scene, "floor-streak", 256, 32, (context) => {
        const along = context.createLinearGradient(0, 0, 256, 0);
        along.addColorStop(0, "rgba(255, 255, 255, 0)");
        along.addColorStop(0.85, "rgba(255, 255, 255, 0.55)");
        along.addColorStop(1, "rgba(255, 255, 255, 1)");
        context.fillStyle = along;
        // Soft top and bottom edges
        for (let y = 0; y < 32; y++) {
            context.globalAlpha = Math.sin((y / 31) * Math.PI) ** 2;
            context.fillRect(0, y, 256, 1);
        }
    });
}

/** Wrap `value` into [low, high). */
function wrap(value: number, low: number, high: number) {
    const span = high - low;
    return low + ((((value - low) % span) + span) % span);
}

function tileLayer(scene: Phaser.Scene, key: string) {
    return scene.add.tileSprite(0, 0, REACH * 2, REACH * 2, key);
}

// --- Disco ----------------------------------------------------------------------------

/** One floor tile in the world (each texture pixel is two world units). */
const DISCO_TILE = 128;
/** Tiles across the floor before it repeats. */
const DISCO_TILES = 12;
const DISCO_COLORS = ["#ff4fd8", "#3ff0ff", "#ffd24a", "#9b5cff", "#5cff9b", "#ff7a3d"];
const SPOT_COLORS = [0xff4fd8, 0x3ff0ff, 0xffd24a, 0x9b5cff, 0x5cff9b];
const SPECKS = 70;
/** Chance per beat that a tile changes: lazy tiles near the low end, restless ones near the high. */
const DISCO_CHANGE_MIN = 0.05;
const DISCO_CHANGE_MAX = 0.3;
/** Extra chance of changing on the first beat of a bar. */
const DISCO_BAR_BOOST = 2;
/** Chance a change turns the tile dark instead of a new colour. */
const DISCO_DARK = 0.4;
/** Beats a change takes to fade in (each change picks between these). */
const DISCO_FADE_MIN = 0.6;
const DISCO_FADE_MAX = 2;
/** The longest a tile stays the same, in beats. */
const DISCO_HOLD_MAX = 16;
const DISCO_LIT_ALPHA = 0.72;

/** A number in [0, 1) that's the same for everyone for this tile and beat. */
function hash(tile: number, beat: number, salt: number) {
    let h = Math.imul(tile + 1, 374761393) ^ Math.imul(beat + 7, 668265263) ^ Math.imul(salt + 3, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether `tile` changes on beat `beat`. */
function discoChanges(tile: number, beat: number) {
    const restless = DISCO_CHANGE_MIN + hash(tile, 0, 9) * (DISCO_CHANGE_MAX - DISCO_CHANGE_MIN);
    const chance = beat % 4 === 0 ? restless * DISCO_BAR_BOOST : restless;
    return hash(tile, beat, 1) < chance || beat % DISCO_HOLD_MAX === tile % DISCO_HOLD_MAX;
}

/** The colour `tile` changes to on beat `beat` (-1 for dark). */
function discoColor(tile: number, beat: number) {
    if (hash(tile, beat, 2) < DISCO_DARK) {
        return -1;
    }
    return Math.floor(hash(tile, beat, 3) * DISCO_COLORS.length);
}

/** The last beat at or before `beat` on which `tile` changed. */
function lastChange(tile: number, beat: number) {
    for (let b = beat; b > beat - DISCO_HOLD_MAX; b--) {
        if (discoChanges(tile, b)) {
            return b;
        }
    }
    return beat - DISCO_HOLD_MAX;
}

/** One lit tile per colour, drawn once and stamped onto the floor. */
function discoStamps(size: number) {
    return DISCO_COLORS.map((color) => {
        const stamp = document.createElement("canvas");
        stamp.width = stamp.height = size;
        const context = stamp.getContext("2d")!;
        // Lit from below: bright in the middle, the colour all the way out
        const light = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.72);
        light.addColorStop(0, "#ffffff");
        light.addColorStop(0.25, color);
        light.addColorStop(1, color);
        context.fillStyle = light;
        context.fillRect(0, 0, size, size);
        return stamp;
    });
}

/**
 * The dance floor itself: every tile keeps its colour for a while, then
 * fades to another (or goes dark) on a beat of its own choosing, so some
 * tiles change while others stay, like a real floor. Worked out from the
 * beat alone, so everyone sees the same floor.
 */
function discoFloor(scene: Phaser.Scene) {
    const tile = DISCO_TILE / 2;
    const inner = tile - 4;
    const size = tile * DISCO_TILES;
    const key = "floor-disco";
    if (scene.textures.exists(key)) {
        scene.textures.remove(key);
    }
    const texture = scene.textures.createCanvas(key, size, size)!;
    const context = texture.getContext();
    const stamps = discoStamps(inner);
    // What each tile looked like when last drawn, to redraw only what changed
    const drawn: string[] = [];

    context.fillStyle = "#07030e";
    context.fillRect(0, 0, size, size);

    const draw = (beat: number) => {
        const whole = Math.floor(beat);
        let changed = false;

        for (let i = 0; i < DISCO_TILES * DISCO_TILES; i++) {
            const at = lastChange(i, whole);
            const from = discoColor(i, lastChange(i, at - 1));
            const to = discoColor(i, at);
            const length = DISCO_FADE_MIN + hash(i, at, 4) * (DISCO_FADE_MAX - DISCO_FADE_MIN);
            const t = Math.min(1, (beat - at) / length);
            const fade = from === to ? 1 : t * t * (3 - 2 * t);

            // Skip tiles that look the same as last frame
            const look = `${from},${to},${Math.round(fade * 64)}`;
            if (drawn[i] === look) {
                continue;
            }
            drawn[i] = look;
            changed = true;

            const x = (i % DISCO_TILES) * tile + 2;
            const y = Math.floor(i / DISCO_TILES) * tile + 2;
            // Dark glass, then the old colour fading out as the new one fades in
            context.globalAlpha = 1;
            context.fillStyle = "#150a24";
            context.fillRect(x, y, inner, inner);
            if (from >= 0 && fade < 1) {
                context.globalAlpha = DISCO_LIT_ALPHA * (1 - fade);
                context.drawImage(stamps[from], x, y);
            }
            if (to >= 0) {
                context.globalAlpha = DISCO_LIT_ALPHA * fade;
                context.drawImage(stamps[to], x, y);
            }
        }
        context.globalAlpha = 1;
        if (changed) {
            texture.refresh();
        }
    };

    draw(0);
    return { key, draw };
}

function createDisco(scene: Phaser.Scene): Floor {
    const random = seededRandom(128);
    const dance = discoFloor(scene);
    const floor = tileLayer(scene, dance.key).setTileScale(2);
    const glow = glowTexture(scene);

    // Spotlight pools sweeping slowly over the floor
    const spots = SPOT_COLORS.map((color, i) => ({
        image: scene.add.image(0, 0, glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(6.5),
        // Each wanders on its own looping path
        speedX: 0.031 + i * 0.007,
        speedY: 0.023 + i * 0.009,
        phase: i * 1.9,
    }));

    // Mirror-ball specks: small spots of light circling the room together
    const specks = Array.from({ length: SPECKS }, () => ({
        image: scene.add
            .image(0, 0, glow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.18 + random() * 0.18)
            .setAlpha(0.35 + random() * 0.3),
        angle: random() * Math.PI * 2,
        distance: random(),
    }));

    const container = scene.add.container(0, 0, [
        floor,
        ...spots.map((s) => s.image),
        ...specks.map((s) => s.image),
    ]);

    return {
        container,
        tiles: [floor],
        weight: 0,
        beat: 0,
        rate: 2,
        animate(beat, area) {
            dance.draw(beat);

            for (const spot of spots) {
                spot.image.setPosition(
                    area.centerX + Math.sin(beat * spot.speedX + spot.phase) * area.width * 0.5,
                    area.centerY + Math.sin(beat * spot.speedY + spot.phase * 1.3) * area.height * 0.5,
                );
            }

            // One slow turn of the mirror ball every 32 bars
            const turn = (beat / 128) * Math.PI * 2;
            const reach = Math.hypot(area.width, area.height) * 0.55;
            for (const speck of specks) {
                const angle = speck.angle + turn;
                const distance = (0.15 + 0.85 * speck.distance) * reach;
                speck.image.setPosition(
                    area.centerX + Math.cos(angle) * distance,
                    area.centerY + Math.sin(angle) * distance,
                );
            }
        },
    };
}

// --- Synthwave --------------------------------------------------------------------------

const GRID = 320;
const RUNNERS = 16;
const RUNNER_COLORS = [0xff3fa4, 0x3ff0ff, 0xff8a3d, 0xb04bff];

function synthTexture(scene: Phaser.Scene) {
    return canvasTexture(scene, "floor-synthwave", GRID, GRID, (context) => {
        const ground = context.createLinearGradient(0, 0, GRID, GRID);
        ground.addColorStop(0, "#14072a");
        ground.addColorStop(1, "#1d0a36");
        context.fillStyle = ground;
        context.fillRect(0, 0, GRID, GRID);

        // Fine lines halfway, then the main grid with a soft glow
        context.strokeStyle = "rgba(176, 75, 255, 0.25)";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(GRID / 2, 0);
        context.lineTo(GRID / 2, GRID);
        context.moveTo(0, GRID / 2);
        context.lineTo(GRID, GRID / 2);
        context.stroke();

        for (const [width, alpha] of [
            [12, 0.08],
            [6, 0.16],
            [2.5, 0.85],
        ]) {
            context.strokeStyle = `rgba(255, 63, 164, ${alpha})`;
            context.lineWidth = width;
            context.beginPath();
            // Lines on the tile's edges (half on each side, so they join up)
            for (const at of [0, GRID]) {
                context.moveTo(at, 0);
                context.lineTo(at, GRID);
                context.moveTo(0, at);
                context.lineTo(GRID, at);
            }
            context.stroke();
        }
    });
}

function createSynthwave(scene: Phaser.Scene): Floor {
    const random = seededRandom(112);
    const grid = tileLayer(scene, synthTexture(scene));
    const streak = streakTexture(scene);

    // Pulses of light running along the grid lines
    const runners = Array.from({ length: RUNNERS }, () => ({
        image: scene.add
            .image(0, 0, streak)
            .setOrigin(1, 0.5)
            .setTint(RUNNER_COLORS[Math.floor(random() * RUNNER_COLORS.length)])
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(1.6, 0.6),
        vertical: random() < 0.5,
        /** Which grid line (counted from the course's middle). */
        line: Math.floor(random() * 11) - 5,
        direction: random() < 0.5 ? 1 : -1,
        offset: random(),
        /** Cells per beat. */
        speed: 0.5 + random() * 0.75,
    }));

    const container = scene.add.container(0, 0, [grid, ...runners.map((r) => r.image)]);

    return {
        container,
        tiles: [grid],
        weight: 0,
        beat: 0,
        rate: 2,
        animate(beat, area) {
            // The grid's glow breathes, gently, over two bars
            grid.setAlpha(0.88 + 0.12 * Math.sin((beat / 8) * Math.PI * 2));

            for (const r of runners) {
                const lineAt = (Math.round((r.vertical ? area.centerX : area.centerY) / GRID) + r.line) * GRID;
                const low = r.vertical ? area.top : area.left;
                const high = r.vertical ? area.bottom : area.right;
                const along = wrap(low + (r.offset * (high - low)) + r.direction * beat * r.speed * GRID, low, high);

                r.image
                    .setPosition(r.vertical ? lineAt : along, r.vertical ? along : lineAt)
                    .setRotation((r.vertical ? Math.PI / 2 : 0) + (r.direction < 0 ? Math.PI : 0));
            }
        },
    };
}

// --- Eurobeat -----------------------------------------------------------------------------

const LANE = 512;
const CARS = 14;

function euroTexture(scene: Phaser.Scene) {
    return canvasTexture(scene, "floor-eurobeat", LANE, LANE, (context) => {
        const random = seededRandom(156);
        context.fillStyle = "#0b1230";
        context.fillRect(0, 0, LANE, LANE);

        // Asphalt grain
        for (let i = 0; i < 9000; i++) {
            const shade = random() < 0.5 ? "255, 255, 255" : "0, 0, 0";
            context.fillStyle = `rgba(${shade}, ${0.03 + random() * 0.05})`;
            context.fillRect(random() * LANE, random() * LANE, 2, 2);
        }

        // A dashed lane line across the middle
        context.fillStyle = "rgba(220, 235, 255, 0.35)";
        for (let x = 0; x < LANE; x += 128) {
            context.fillRect(x + 16, LANE / 2 - 3, 80, 6);
        }

        // Blue light along the edges between roads
        for (const [width, alpha] of [
            [14, 0.08],
            [6, 0.18],
            [2, 0.7],
        ]) {
            context.strokeStyle = `rgba(63, 214, 255, ${alpha})`;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(LANE, 0);
            context.moveTo(0, LANE);
            context.lineTo(LANE, LANE);
            context.stroke();
        }
    });
}

function createEurobeat(scene: Phaser.Scene): Floor {
    const random = seededRandom(1560);
    const road = tileLayer(scene, euroTexture(scene));
    const streak = streakTexture(scene);

    // Cars at night: headlights one way (cyan), tail lights the other (red)
    const cars = Array.from({ length: CARS }, (_, i) => {
        const outward = i % 2 === 0;
        return {
            image: scene.add
                .image(0, 0, streak)
                .setOrigin(1, 0.5)
                .setTint(outward ? 0x9feaff : 0xff4060)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(3 + random() * 1.5, 1.1)
                .setRotation(outward ? 0 : Math.PI),
            /** Which road (counted from the course's middle). */
            road: Math.floor(random() * 7) - 3,
            outward,
            offset: random(),
            /** Roads' widths per beat. */
            speed: 0.9 + random() * 0.8,
        };
    });

    const container = scene.add.container(0, 0, [road, ...cars.map((c) => c.image)]);

    return {
        container,
        tiles: [road],
        weight: 0,
        beat: 0,
        rate: 2,
        animate(beat, area) {
            for (const car of cars) {
                // Lanes either side of each dashed line
                const roadY = (Math.round(area.centerY / LANE) + car.road) * LANE;
                const y = roadY + LANE / 2 + (car.outward ? -LANE / 4 : LANE / 4);
                const travel = beat * car.speed * LANE * (car.outward ? 1 : -1);
                const x = wrap(area.left + car.offset * area.width + travel, area.left, area.right);
                car.image.setPosition(x, y);
            }
        },
    };
}

const FACTORIES: Record<string, (scene: Phaser.Scene) => Floor> = {
    disco: createDisco,
    synthwave: createSynthwave,
    eurobeat: createEurobeat,
};

/** The floor under the course, changing with the track. */
export class ArenaFloor {
    private floors = new Map<string, Floor>();
    private readonly area = new Phaser.Geom.Rectangle();

    constructor(private readonly scene: Phaser.Scene) {
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    /** Call every frame with what the music is doing and where the course is. */
    update(pulse: MusicPulse, delta: number, course: Phaser.Geom.Rectangle) {
        const track = pulse.track && FACTORIES[pulse.track] ? pulse.track : undefined;

        if (track && !this.floors.has(track)) {
            const floor = FACTORIES[track](this.scene);
            floor.container.setDepth(DEPTH).setAlpha(0);
            this.floors.set(track, floor);
        }

        // The lights roam the course and a margin round it
        this.area.setTo(
            course.x - ROAM,
            course.y - ROAM,
            course.width + ROAM * 2,
            course.height + ROAM * 2,
        );

        const seconds = delta / 1000;
        const step = seconds / FADE;

        for (const [id, floor] of this.floors) {
            const target = id === track ? 1 : 0;
            floor.weight = target > floor.weight
                ? Math.min(target, floor.weight + step)
                : Math.max(target, floor.weight - step);

            const visible = floor.weight > 0;
            floor.container.setAlpha(floor.weight).setVisible(visible);

            // Hidden floors cost nothing
            if (!visible) {
                continue;
            }

            // Follow the music's beat while it's this floor's track; after
            // that, keep moving at the same pace so nothing jumps
            if (id === track) {
                if (seconds > 0 && pulse.beat > floor.beat) {
                    const rate = (pulse.beat - floor.beat) / seconds;
                    floor.rate += (Math.min(rate, 6) - floor.rate) * 0.1;
                }
                floor.beat = pulse.beat;
            } else {
                floor.beat += floor.rate * seconds;
            }

            for (const layer of floor.tiles) {
                // Centred on the course, with the pattern fixed to the world
                layer.setPosition(course.centerX, course.centerY);
                layer.setTilePosition(course.centerX - REACH, course.centerY - REACH);
            }
            floor.animate(floor.beat, this.area);
        }
    }

    destroy() {
        for (const floor of this.floors.values()) {
            floor.container.destroy();
        }
        this.floors.clear();
    }
}
