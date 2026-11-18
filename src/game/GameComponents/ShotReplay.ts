import * as Phaser from "phaser";
import { ShotHighlight } from "../../../server/types/types";
import { SoundEffects } from "./SoundEffects";
import { COLORS, CSS, FONTS, MARGIN, TYPE, addText, drawPanel } from "../ui/theme";
import { toCssColor } from "./BallManager";

/** Over the course and its moving pieces, like the real balls. */
const TRAIL_DEPTH = 950;
const BALL_DEPTH = 1000;
const TEXT_DEPTH = 1002;

const BALL_RADIUS = 12;
const LINE_WIDTH = 6;
const OUTLINE_WIDTH = 10;
const DOT_RADIUS = 4.5;
const DOT_SPACING = 20;
/** How much bigger the ball looks at the top of a jump. */
const JUMP_SCALE = 0.7;

/** Wait for the last real ball to finish dropping before the replay. */
const START_DELAY_MS = 900;
/** Replay speed: this many ms per pixel, kept between these bounds. */
const MS_PER_PIXEL = 2.2;
const MIN_ROLL_MS = 1600;
const MAX_ROLL_MS = 4200;
const SINK_MS = 250;
/** Time to enjoy it once it has dropped. */
const HOLD_MS = 1600;
const FADE_MS = 300;

const BANNER_WIDTH = 440;
const BANNER_HEIGHT = 108;

interface PathPoint {
    x: number;
    y: number;
    /** How the ball got here from the point before: 0 rolled, 1 flew, 2 came out of a tunnel. */
    kind: number;
    /** Distance along the path to here. */
    distance: number;
}

/** A stretch the ball flew, so it can rise and fall over it. */
interface AirSpan {
    from: number;
    to: number;
}

/** Hit from at least this far from the cup (px): a long putt or approach. */
const LONG_SHOT = 600;
/** Stopped this close to the cup (px). */
const RIGHT_BY_THE_CUP = 60;
const CLOSE_TO_THE_CUP = 200;

/**
 * What made the shot: "Hole in one, off 2 walls and through a tunnel",
 * "Left it close after a long approach", "Holed on shot 3".
 */
export function describeShot(shot: ShotHighlight): string {
    const extras: string[] = [];
    const count = (n: number, one: string, many: string) =>
        n === 1 ? one : many.replace("#", `${n}`);

    if (shot.bounces > 0) {
        extras.push(count(shot.bounces, "off a wall", "off # walls"));
    }
    if (shot.tunnels > 0) {
        extras.push(count(shot.tunnels, "through a tunnel", "through # tunnels"));
    }
    if (shot.jumps > 0) {
        extras.push(count(shot.jumps, "over a jump", "over # jumps"));
    }
    if ((shot.ballHits ?? 0) > 0) {
        extras.push(count(shot.ballHits ?? 0, "off another ball", "off # balls"));
    }
    if ((shot.lipOuts ?? 0) > 0) {
        extras.push(
            shot.sunk
                ? "in after a lip out"
                : count(shot.lipOuts ?? 0, "over the lip", "over the lip # times"),
        );
    }

    const startToCup = shot.startToCup ?? 0;
    const endToCup = shot.endToCup ?? startToCup;
    const long = startToCup >= LONG_SHOT;

    // What it came to: in, or how close it got
    let lead: string;
    if (shot.sunk) {
        if (shot.shotNumber === 1) {
            lead = "hole in one";
        } else if (long) {
            lead = "holed from long range";
        } else if (extras.length > 0) {
            lead = "holed";
        } else {
            lead = `holed on shot ${shot.shotNumber}`;
        }
    } else if (endToCup <= RIGHT_BY_THE_CUP) {
        lead = "stopped right by the cup";
    } else if (endToCup <= CLOSE_TO_THE_CUP) {
        lead = long ? "left it close from long range" : "left it close";
    } else {
        lead = long ? "a long approach" : "the best approach";
    }

    const parts = [lead, ...extras];
    const sentence =
        parts.length === 1
            ? parts[0]
            : parts.length === 2
              ? `${parts[0]}, ${parts[1]}`
              : `${parts[0]}, ${parts.slice(1, -1).join(", ")} and ${parts[parts.length - 1]}`;

    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * The shot of the hole, played again for everyone when a hole ends: the
 * ball rolls its path on the course while a banner says whose it was.
 */
export class ShotReplay {
    private objects: Phaser.GameObjects.GameObject[] = [];
    private banner?: Phaser.GameObjects.Container;
    private timers: Phaser.Time.TimerEvent[] = [];
    private screenWidth = 0;
    private running = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly hud: Phaser.Scene,
        private readonly sounds: SoundEffects,
    ) {}

    /** Called on every resize with the screen size in interface units. */
    layout(width: number, _height: number) {
        this.screenWidth = width;
        this.banner?.setPosition(width / 2, MARGIN);
    }

    isRunning() {
        return this.running;
    }

    /** Play the shot, then call onDone (not called if stopped early). */
    play(shot: ShotHighlight, onDone: () => void) {
        this.stop();

        const points = toPoints(shot.path);
        if (points.length < 2) {
            onDone();
            return;
        }

        this.running = true;

        const color = shot.color ?? 0xffffff;
        const length = points[points.length - 1].distance;
        const rollMs = Phaser.Math.Clamp(
            length * MS_PER_PIXEL,
            MIN_ROLL_MS,
            MAX_ROLL_MS,
        );
        const airSpans = getAirSpans(points);

        this.showBanner(shot, color);

        const trail = this.scene.add.graphics().setDepth(TRAIL_DEPTH);
        const shadow = this.scene.add
            .ellipse(points[0].x, points[0].y, BALL_RADIUS * 2, BALL_RADIUS * 1.4, 0x000000, 0.35)
            .setDepth(BALL_DEPTH - 1)
            .setVisible(false);
        const ball = this.scene.add
            .circle(points[0].x, points[0].y, BALL_RADIUS, color)
            .setStrokeStyle(3, 0x000000)
            .setDepth(BALL_DEPTH)
            .setScale(0);

        this.objects.push(trail, shadow, ball);

        // The ball appears on the spot it was hit from
        this.scene.tweens.add({
            targets: ball,
            scale: 1,
            duration: 200,
            delay: START_DELAY_MS - 200,
            ease: "Back.easeOut",
        });

        let segment = 1;
        let lastKind = 0;

        const roll = this.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: rollMs,
            delay: START_DELAY_MS,
            // Struck hard, rolling out slowly into the cup
            ease: "Quad.easeOut",
            onStart: () => this.sounds.putt(0.7),
            onUpdate: (tween) => {
                const distance = (tween.getValue() ?? 0) * length;

                while (
                    segment < points.length - 1 &&
                    points[segment].distance < distance
                ) {
                    segment++;
                }

                // Skip past the tunnel's zero-length jump
                while (
                    segment < points.length - 1 &&
                    points[segment].kind === 2 &&
                    points[segment].distance <= distance
                ) {
                    segment++;
                }

                const position = getPosition(points, segment, distance);
                const kind = points[segment].kind;

                if (kind !== lastKind) {
                    if (kind === 1) {
                        this.sounds.jump();
                    } else if (lastKind === 1) {
                        this.sounds.bounce(0.5);
                    }
                    lastKind = kind;
                }

                const height = getHeight(airSpans, distance);

                ball.setPosition(position.x, position.y).setScale(1 + JUMP_SCALE * height);
                shadow
                    .setVisible(height > 0)
                    .setPosition(position.x + 6 + height * 22, position.y + 9 + height * 30)
                    .setAlpha(0.35 - height * 0.15);

                drawTrail(trail, points, distance, color);
            },
            onComplete: () => {
                shadow.setVisible(false);
                ball.setScale(1);
                drawTrail(trail, points, length, color);

                const end = points[points.length - 1];
                if (shot.sunk) {
                    this.sink(ball, end, color, shot);
                } else {
                    this.stopShort(end, color);
                }
            },
        });

        // A tunnel: the ball vanishes and comes out somewhere else
        let tunnelsPassed = 0;
        const tunnelWatch = this.scene.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                if (!roll.isPlaying()) {
                    return;
                }
                const distance = (roll.getValue() ?? 0) * length;
                const passed = points.filter(
                    (point) => point.kind === 2 && point.distance <= distance,
                ).length;
                if (passed > tunnelsPassed) {
                    tunnelsPassed = passed;
                    this.sounds.tunnel();
                }
            },
        });
        this.timers.push(tunnelWatch);

        this.finish = () => {
            this.stop();
            onDone();
        };
    }

    /** Stop early and clear up, without calling onDone. */
    stop() {
        this.running = false;
        this.finish = undefined;

        for (const timer of this.timers) {
            timer.remove();
        }
        this.timers = [];

        for (const object of this.objects) {
            this.scene.tweens.killTweensOf(object);
            object.destroy();
        }
        this.objects = [];

        if (this.banner) {
            this.hud.tweens.killTweensOf(this.banner);
            this.banner.destroy();
            this.banner = undefined;
        }
    }

    private finish?: () => void;

    /** Into the cup, the player's catchphrase, a moment to enjoy it, then fade. */
    private sink(
        ball: Phaser.GameObjects.Arc,
        cup: PathPoint,
        color: number,
        shot: ShotHighlight,
    ) {
        this.sounds.cup();

        this.scene.tweens.add({
            targets: ball,
            scale: 0.2,
            alpha: 0,
            duration: SINK_MS,
            ease: "Quad.easeIn",
        });

        const ring = this.scene.add
            .circle(cup.x, cup.y, 16)
            .setStrokeStyle(6, color)
            .setDepth(BALL_DEPTH - 1);
        this.objects.push(ring);

        this.scene.tweens.add({
            targets: ring,
            scale: 3.5,
            alpha: 0,
            duration: 800,
            delay: SINK_MS * 0.6,
            ease: "Cubic.easeOut",
        });

        if (shot.catchphrase) {
            const text = this.scene.add
                .text(cup.x, cup.y - 30, shot.catchphrase, {
                    fontFamily: FONTS.bold,
                    fontSize: "44px",
                    color: toCssColor(color),
                    stroke: "#000000",
                    strokeThickness: 8,
                })
                .setOrigin(0.5)
                .setDepth(TEXT_DEPTH)
                .setAlpha(0);
            this.objects.push(text);

            this.scene.tweens.add({
                targets: text,
                alpha: 1,
                y: cup.y - 70,
                duration: 400,
                delay: SINK_MS * 0.6,
                ease: "Back.easeOut",
            });
        }

        this.holdThenFinish();
    }

    /** It didn't go in: a ring marks where it stopped. */
    private stopShort(end: PathPoint, color: number) {
        const ring = this.scene.add
            .circle(end.x, end.y, BALL_RADIUS + 4)
            .setStrokeStyle(4, color)
            .setDepth(BALL_DEPTH - 1);
        this.objects.push(ring);

        this.scene.tweens.add({
            targets: ring,
            scale: 2.5,
            alpha: 0,
            duration: 700,
            ease: "Cubic.easeOut",
        });

        this.holdThenFinish();
    }

    /** A moment to take it in, then everything fades and onDone runs. */
    private holdThenFinish() {
        const fade = this.scene.time.delayedCall(HOLD_MS, () => {
            const targets = this.objects.filter((object) => object.active);
            this.scene.tweens.add({ targets, alpha: 0, duration: FADE_MS });
            if (this.banner) {
                this.hud.tweens.add({ targets: this.banner, alpha: 0, duration: FADE_MS });
            }

            this.timers.push(
                this.scene.time.delayedCall(FADE_MS, () => this.finish?.()),
            );
        });
        this.timers.push(fade);
    }

    /** Top centre: "Shot of the hole", whose it was and what made it. */
    private showBanner(shot: ShotHighlight, color: number) {
        const hud = this.hud;
        const left = -BANNER_WIDTH / 2;

        const panel = hud.add.graphics();
        drawPanel(panel, left, 0, BANNER_WIDTH, BANNER_HEIGHT, 18, 0.96);

        const heading = addText(hud, 0, 16, "Shot of the hole", {
            size: TYPE.body,
            bold: true,
            color: CSS.fairway,
        }).setOrigin(0.5, 0);

        const name = addText(hud, 0, 40, shot.name, {
            size: TYPE.title,
            bold: true,
            color: toCssColor(color),
        }).setOrigin(0.5, 0);

        // Keep a long name inside the card
        const maxNameWidth = BANNER_WIDTH - 60;
        if (name.width > maxNameWidth) {
            name.setScale(maxNameWidth / name.width);
        }

        const detail = addText(hud, 0, 78, describeShot(shot), {
            size: TYPE.body,
            color: CSS.muted,
        }).setOrigin(0.5, 0);

        if (detail.width > BANNER_WIDTH - 40) {
            detail.setScale((BANNER_WIDTH - 40) / detail.width);
        }

        // Its points, small in the corner
        const points = addText(
            hud,
            BANNER_WIDTH / 2 - 18,
            16,
            shot.points !== undefined ? `${shot.points} pts` : "",
            { size: TYPE.small, color: CSS.muted },
        ).setOrigin(1, 0);

        // A flag-green edge along the top marks it as a highlight
        panel.fillStyle(COLORS.fairway, 1);
        panel.fillRoundedRect(left + 18, 0, BANNER_WIDTH - 36, 3, 1.5);

        this.banner = hud.add
            .container(this.screenWidth / 2, MARGIN, [panel, heading, name, detail, points])
            .setDepth(20)
            .setAlpha(0);

        hud.tweens.add({
            targets: this.banner,
            alpha: 1,
            y: { from: MARGIN - 16, to: MARGIN },
            duration: 350,
            ease: "Cubic.easeOut",
        });
    }
}

function toPoints(path: number[]): PathPoint[] {
    const points: PathPoint[] = [];

    for (let i = 0; i + 2 < path.length; i += 3) {
        const x = path[i];
        const y = path[i + 1];
        const kind = points.length === 0 ? 0 : path[i + 2];
        const previous = points[points.length - 1];
        const distance = previous
            ? previous.distance +
              (kind === 2 ? 0 : Math.hypot(x - previous.x, y - previous.y))
            : 0;

        points.push({ x, y, kind, distance });
    }

    return points;
}

function getAirSpans(points: PathPoint[]): AirSpan[] {
    const spans: AirSpan[] = [];

    for (let i = 1; i < points.length; i++) {
        if (points[i].kind !== 1) {
            continue;
        }

        const last = spans[spans.length - 1];
        if (last && last.to === points[i - 1].distance) {
            last.to = points[i].distance;
        } else {
            spans.push({ from: points[i - 1].distance, to: points[i].distance });
        }
    }

    return spans;
}

/** 0 on the ground, 1 at the top of a jump. */
function getHeight(spans: AirSpan[], distance: number) {
    for (const span of spans) {
        if (distance > span.from && distance < span.to && span.to > span.from) {
            return Math.sin(((distance - span.from) / (span.to - span.from)) * Math.PI);
        }
    }
    return 0;
}

function getPosition(points: PathPoint[], segment: number, distance: number) {
    const a = points[segment - 1];
    const b = points[segment];

    if (b.kind === 2 || b.distance === a.distance) {
        return distance >= b.distance ? b : a;
    }

    const t = Phaser.Math.Clamp((distance - a.distance) / (b.distance - a.distance), 0, 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The path so far: a line where it rolled, dots where it flew. */
function drawTrail(
    g: Phaser.GameObjects.Graphics,
    points: PathPoint[],
    upTo: number,
    color: number,
) {
    g.clear();

    // Ground first with a dark edge, then the coloured line on top
    for (const [width, lineColor, alpha] of [
        [OUTLINE_WIDTH, 0x000000, 0.3],
        [LINE_WIDTH, color, 0.95],
    ] as const) {
        g.lineStyle(width, lineColor, alpha);

        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];

            if (a.distance >= upTo || b.kind !== 0) {
                continue;
            }

            const end = b.distance <= upTo ? b : getPosition(points, i, upTo);
            g.lineBetween(a.x, a.y, end.x, end.y);
        }
    }

    // Dots, evenly spaced along the flight
    g.fillStyle(color, 0.95);
    g.lineStyle(1.5, 0x000000, 0.3);

    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];

        if (b.kind !== 1 || a.distance >= upTo) {
            continue;
        }

        const first = Math.ceil(a.distance / DOT_SPACING) * DOT_SPACING;
        const last = Math.min(b.distance, upTo);

        for (let d = first; d <= last; d += DOT_SPACING) {
            const p = getPosition(points, i, d);
            g.fillCircle(p.x, p.y, DOT_RADIUS);
            g.strokeCircle(p.x, p.y, DOT_RADIUS);
        }
    }
}
