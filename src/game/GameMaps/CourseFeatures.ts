import * as Phaser from "phaser";
import {
    drawHub,
    drawMover,
    drawRamp,
    drawSail,
    drawSand,
    drawSlope,
    drawTrack,
    drawTunnel,
    pointInPolygon,
} from "./FeatureArt";

/**
 * The course pieces beyond walls: sand, slopes, ramps, tunnels, windmills
 * and sliding blocks. They're placed in Tiled as objects with these names:
 *
 *   Sand      rect / ellipse / polygon   slows balls right down
 *   Slope     rect / polygon             angle (deg, downhill; 0 = right,
 *                                        90 = down), strength (default 0.12)
 *   Ramp      rect / polygon             angle (deg, the way up); balls
 *                                        fast enough jump off the top and
 *                                        fly over hedges (walls with
 *                                        material "hedge")
 *   Tunnel    ellipse / point            entrance; exitX, exitY, exitAngle
 *   Windmill  point / ellipse            the hub; blades (4), length (120),
 *                                        width (34), speed (deg per step,
 *                                        1.5), phase (deg)
 *   Mover     rect                       a block at its start; dx, dy (how
 *                                        far it slides), period (steps per
 *                                        round trip, 240), phase (0-1)
 *
 * Windmills and movers only move while a shot is rolling, by the physics
 * step: every screen starts each shot with them in the same place (the
 * server keeps the count, see courseTime).
 */

type Point = { x: number; y: number };
type TiledObject = Phaser.Types.Tilemaps.TiledObject;
type Body = MatterJS.BodyType;

/** Matter's Body functions, with the "move with velocity" flag Phaser's types leave out. */
type MatterBodyFunctions = {
    setPosition(body: Body, position: Point, updateVelocity?: boolean): void;
    setAngle(body: Body, angle: number, updateVelocity?: boolean): void;
    setVelocity(body: Body, velocity: Point): void;
};

/** Ball drag on grass, and in sand (fraction of speed lost per step). */
export const GRASS_DRAG = 0.02;
const SAND_DRAG = 0.1;
const DEFAULT_SLOPE = 0.12;
/** Pull back down a ramp, so a ball too slow to jump rolls back. */
const RAMP_PULL = 0.1;
/** Slowest ball that jumps off a ramp. */
const RAMP_MIN_SPEED = 5;
/** Steps in the air per unit of take-off speed, and the most. */
const AIR_STEPS_PER_SPEED = 3.2;
const MAX_AIR_STEPS = 70;
const TUNNEL_RADIUS = 24;
/** Slowest a ball leaves a tunnel, so it never stalls in the mouth. */
const TUNNEL_MIN_EXIT_SPEED = 5;
const TUNNEL_EXIT_SPEED = 0.9;
const BALL_RADIUS = 12;

/** Walls balls can fly over from a ramp (Matter collision category). */
export const HEDGE_CATEGORY = 0x0002;

/** What the course remembers about each ball between steps. */
export interface BallCourseState {
    /** Steps left in the air (0 = rolling). */
    airborne: number;
    /** Length of the current jump, for drawing its arc. */
    airTotal: number;
    onRamp: boolean;
    /** Rolling over the cup too fast: don't count it twice. */
    lipping: boolean;
    /** Steps spent barely moving, to settle balls on slopes. */
    slowSteps: number;
    /** Settled: slopes stop pushing it until it's hit again. */
    resting: boolean;
}

export function newBallCourseState(): BallCourseState {
    return {
        airborne: 0,
        airTotal: 0,
        onRamp: false,
        lipping: false,
        slowSteps: 0,
        resting: false,
    };
}

/** Something that happened to a ball this step, for sounds and pictures. */
export type BallEvent = "jumped" | "landed" | "tunnel";

interface Zone {
    points: Point[];
    box: { left: number; top: number; right: number; bottom: number };
}

interface Slope extends Zone {
    direction: Point;
    strength: number;
}

interface Ramp extends Zone {
    direction: Point;
}

interface Tunnel {
    entrance: Point;
    exit: Point;
    direction: Point;
}

interface Windmill {
    x: number;
    y: number;
    /** Distance from the hub to the middle of each blade. */
    reach: number;
    blades: {
        body: Body;
        offset: number;
        shadow: Phaser.GameObjects.Graphics;
        sail: Phaser.GameObjects.Graphics;
    }[];
    speed: number;
    phase: number;
}

interface Mover {
    body: Body;
    from: Point;
    offset: Point;
    period: number;
    phase: number;
    art: Phaser.GameObjects.Graphics[];
}

function property(object: TiledObject, name: string): unknown {
    return (object.properties as { name: string; value: unknown }[] | undefined)?.find(
        (candidate) => candidate.name === name,
    )?.value;
}

function numberProperty(object: TiledObject, name: string, fallback: number) {
    const value = property(object, name);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fromDegrees(degrees: number): Point {
    const radians = (degrees * Math.PI) / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
}

/** The outline of a rect, ellipse or polygon object, in world coordinates. */
function outlineOf(object: TiledObject): Point[] {
    const x = object.x ?? 0;
    const y = object.y ?? 0;
    const w = object.width ?? 0;
    const h = object.height ?? 0;

    if (object.polygon && object.polygon.length >= 3) {
        return object.polygon.map((p) => ({ x: x + p.x, y: y + p.y }));
    }

    if (object.ellipse) {
        return Array.from({ length: 40 }, (_, i) => {
            const a = (i / 40) * Math.PI * 2;
            return { x: x + w / 2 + (Math.cos(a) * w) / 2, y: y + h / 2 + (Math.sin(a) * h) / 2 };
        });
    }

    return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
    ];
}

function zoneOf(points: Point[]): Zone {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        points,
        box: {
            left: Math.min(...xs),
            top: Math.min(...ys),
            right: Math.max(...xs),
            bottom: Math.max(...ys),
        },
    };
}

function inZone(zone: Zone, p: Point) {
    return (
        p.x >= zone.box.left &&
        p.x <= zone.box.right &&
        p.y >= zone.box.top &&
        p.y <= zone.box.bottom &&
        pointInPolygon(p.x, p.y, zone.points)
    );
}

export class CourseFeatures {
    private sand: Zone[] = [];
    private slopes: Slope[] = [];
    private ramps: Ramp[] = [];
    private tunnels: Tunnel[] = [];
    private windmills: Windmill[] = [];
    private movers: Mover[] = [];
    private bodies: Body[] = [];
    /** Static art (baked with the course) and moving art. */
    private art: Phaser.GameObjects.GameObject[] = [];
    /** Physics steps the moving pieces have run on this hole. */
    private time = 0;

    private readonly matterBody: MatterBodyFunctions;

    constructor(private readonly scene: Phaser.Scene) {
        this.matterBody = scene.matter.body as unknown as MatterBodyFunctions;
    }

    /** Names of the Tiled objects this handles. */
    static readonly NAMES = ["Sand", "Slope", "Ramp", "Tunnel", "Windmill", "Mover"];

    add(object: TiledObject) {
        switch (object.name) {
            case "Sand": {
                const points = outlineOf(object);
                this.sand.push(zoneOf(points));
                this.art.push(drawSand(this.scene, points));
                break;
            }

            case "Slope": {
                const points = outlineOf(object);
                const direction = fromDegrees(numberProperty(object, "angle", 0));
                const strength = numberProperty(object, "strength", DEFAULT_SLOPE);
                this.slopes.push({ ...zoneOf(points), direction, strength });
                this.art.push(drawSlope(this.scene, points, direction, strength));
                break;
            }

            case "Ramp": {
                const points = outlineOf(object);
                const direction = fromDegrees(numberProperty(object, "angle", 0));
                this.ramps.push({ ...zoneOf(points), direction });
                this.art.push(drawRamp(this.scene, points, direction));
                break;
            }

            case "Tunnel": {
                const entrance = {
                    x: (object.x ?? 0) + (object.width ?? 0) / 2,
                    y: (object.y ?? 0) + (object.height ?? 0) / 2,
                };
                const exit = {
                    x: numberProperty(object, "exitX", entrance.x),
                    y: numberProperty(object, "exitY", entrance.y),
                };
                const direction = fromDegrees(numberProperty(object, "exitAngle", 0));
                this.tunnels.push({ entrance, exit, direction });
                this.art.push(drawTunnel(this.scene, entrance, exit, direction, TUNNEL_RADIUS));
                break;
            }

            case "Windmill":
                this.addWindmill(object);
                break;

            case "Mover":
                this.addMover(object);
                break;
        }
    }

    private addWindmill(object: TiledObject) {
        const x = (object.x ?? 0) + (object.width ?? 0) / 2;
        const y = (object.y ?? 0) + (object.height ?? 0) / 2;
        const count = Math.max(1, Math.round(numberProperty(object, "blades", 4)));
        const length = numberProperty(object, "length", 120);
        const width = numberProperty(object, "width", 34);
        const hubRadius = 24;
        const start = hubRadius - 6;

        const blades: Windmill["blades"] = [];

        for (let i = 0; i < count; i++) {
            const body = this.scene.matter.add.rectangle(x, y, length, width, {
                isStatic: true,
                restitution: 0.6,
            });
            this.bodies.push(body);

            const sail = drawSail(this.scene, length, width, start);
            this.art.push(sail.shadow, sail.body);

            blades.push({
                body,
                offset: (i / count) * Math.PI * 2,
                shadow: sail.shadow,
                sail: sail.body,
            });
        }

        // The hub is solid too
        const hub = this.scene.matter.add.circle(x, y, hubRadius, { isStatic: true });
        this.bodies.push(hub);
        this.art.push(drawHub(this.scene, x, y, hubRadius));

        this.windmills.push({
            x,
            y,
            // Blade bodies are centred along the blade, outside the hub
            reach: start + length / 2,
            blades,
            speed: (numberProperty(object, "speed", 1.5) * Math.PI) / 180,
            phase: (numberProperty(object, "phase", 0) * Math.PI) / 180,
        });
    }

    private addMover(object: TiledObject) {
        const w = object.width ?? 80;
        const h = object.height ?? 80;
        const from = { x: (object.x ?? 0) + w / 2, y: (object.y ?? 0) + h / 2 };
        const offset = { x: numberProperty(object, "dx", 0), y: numberProperty(object, "dy", 0) };

        const body = this.scene.matter.add.rectangle(from.x, from.y, w, h, {
            isStatic: true,
            restitution: 0.6,
        });
        this.bodies.push(body);

        this.art.push(drawTrack(this.scene, from, { x: from.x + offset.x, y: from.y + offset.y }, Math.min(w, h)));
        const block = drawMover(this.scene, w, h);
        this.art.push(block.shadow, block.body);

        this.movers.push({
            body,
            from,
            offset,
            period: Math.max(30, numberProperty(object, "period", 240)),
            phase: numberProperty(object, "phase", 0),
            art: [block.shadow, block.body],
        });
    }

    /** Put the moving pieces where they are at this many steps into the hole. */
    setTime(time: number) {
        this.time = time;
        this.pose(false);
    }

    getTime() {
        return this.time;
    }

    /** One physics step of a rolling shot: the moving pieces move on. */
    advance() {
        this.time += 1;
        this.pose(true);
    }

    /**
     * Move the windmills and blocks to the current time. While a shot rolls
     * they move with velocity (so they push balls); otherwise they're put
     * in place at rest.
     */
    private pose(moving: boolean) {
        for (const windmill of this.windmills) {
            const reach = windmill.reach;
            const turn = windmill.phase + windmill.speed * this.time;

            for (const blade of windmill.blades) {
                const angle = turn + blade.offset;
                this.matterBody.setPosition(
                    blade.body,
                    {
                        x: windmill.x + Math.cos(angle) * reach,
                        y: windmill.y + Math.sin(angle) * reach,
                    },
                    moving,
                );
                this.matterBody.setAngle(blade.body, angle, moving);

                // The shadow falls down-right of the sail
                blade.sail.setPosition(windmill.x, windmill.y).setRotation(angle);
                blade.shadow.setPosition(windmill.x + 5, windmill.y + 8).setRotation(angle);
            }
        }

        for (const mover of this.movers) {
            const t = 0.5 - 0.5 * Math.cos(((this.time / mover.period + mover.phase) * Math.PI * 2));
            const x = mover.from.x + mover.offset.x * t;
            const y = mover.from.y + mover.offset.y * t;
            this.matterBody.setPosition(mover.body, { x, y }, moving);

            const [shadow, block] = mover.art as Phaser.GameObjects.Graphics[];
            shadow.setPosition(x, y);
            block.setPosition(x, y);
        }
    }

    /** Does this course have anything that moves? */
    hasMovingParts() {
        return this.windmills.length > 0 || this.movers.length > 0;
    }

    /**
     * What the course does to one ball in one physics step. Returns what
     * happened, if anything worth a sound.
     */
    applyToBall(body: Body, state: BallCourseState): BallEvent | undefined {
        const p = body.position;

        // In the air: nothing on the ground touches it
        if (state.airborne > 0) {
            state.airborne -= 1;

            if (state.airborne === 0) {
                body.collisionFilter.mask = 0xffffffff;
                body.frictionAir = this.dragAt(p);
                return "landed";
            }
            return undefined;
        }

        body.frictionAir = this.dragAt(p);

        // Slopes push, unless the ball has settled
        if (!state.resting) {
            for (const slope of this.slopes) {
                if (inZone(slope, p)) {
                    this.push(body, slope.direction, slope.strength);
                }
            }
        }

        // Ramps pull back down; leaving the top fast enough is a jump
        const ramp = this.ramps.find((candidate) => inZone(candidate, p));

        if (ramp) {
            if (!state.resting) {
                this.push(body, ramp.direction, -RAMP_PULL);
            }
            state.onRamp = true;
        } else if (state.onRamp) {
            state.onRamp = false;
            const last = this.ramps.find((candidate) =>
                inZone(candidate, { x: p.x - body.velocity.x, y: p.y - body.velocity.y }),
            );
            const speed = body.speed;
            const up = last
                ? body.velocity.x * last.direction.x + body.velocity.y * last.direction.y
                : 0;

            if (last && up > 0 && speed >= RAMP_MIN_SPEED) {
                state.airTotal = Math.min(MAX_AIR_STEPS, Math.round(speed * AIR_STEPS_PER_SPEED));
                state.airborne = state.airTotal;
                state.resting = false;
                // Fly over hedges
                body.collisionFilter.mask = 0xffffffff & ~HEDGE_CATEGORY;
                body.frictionAir = GRASS_DRAG * 0.25;
                return "jumped";
            }
        }

        // Tunnels: in at the entrance, out at the exit, still rolling
        for (const tunnel of this.tunnels) {
            if (Math.hypot(p.x - tunnel.entrance.x, p.y - tunnel.entrance.y) < TUNNEL_RADIUS - 4) {
                const speed = Math.max(body.speed * TUNNEL_EXIT_SPEED, TUNNEL_MIN_EXIT_SPEED);
                const out = TUNNEL_RADIUS + BALL_RADIUS + 6;
                this.matterBody.setPosition(body, {
                    x: tunnel.exit.x + tunnel.direction.x * out,
                    y: tunnel.exit.y + tunnel.direction.y * out,
                });
                this.matterBody.setVelocity(body, {
                    x: tunnel.direction.x * speed,
                    y: tunnel.direction.y * speed,
                });
                state.resting = false;
                return "tunnel";
            }
        }

        return undefined;
    }

    private dragAt(p: Point) {
        return this.sand.some((zone) => inZone(zone, p)) ? SAND_DRAG : GRASS_DRAG;
    }

    private push(body: Body, direction: Point, amount: number) {
        this.matterBody.setVelocity(body, {
            x: body.velocity.x + direction.x * amount,
            y: body.velocity.y + direction.y * amount,
        });
    }

    /** Slopes and ramps make a ball creep; this is how still is "still". */
    get pullsBalls() {
        return this.slopes.length > 0 || this.ramps.length > 0;
    }

    /** Art for the moving pieces (not baked with the course). */
    get movingArt(): Phaser.GameObjects.GameObject[] {
        return [
            ...this.windmills.flatMap((w) => w.blades.flatMap((b) => [b.shadow, b.sail])),
            ...this.movers.flatMap((m) => m.art),
        ];
    }

    destroy() {
        for (const body of this.bodies) {
            this.scene.matter.world.remove(body);
        }
        for (const art of this.art) {
            art.destroy();
        }
    }
}
