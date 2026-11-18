import * as Phaser from "phaser";
import { drawCup } from "./CourseArt";
import { BallCourseState } from "./CourseFeatures";

const CUP_RADIUS = 15;

/**
 * Fastest a ball can be going and still drop in. Anything faster rolls over
 * the cup (a lip-out), so a short putt needs the right touch, not full power.
 */
export const CUP_MAX_SPEED = 10;

/** A lip-out turns the ball by up to this much (radians), and slows it. */
const LIP_TURN = 0.55;
const LIP_SLOWDOWN = 0.82;

export type CupResult = "sink" | "lip";

export class Goal {
    private readonly visual: { destroy(): void };

    constructor(
        private readonly scene: Phaser.Scene,
        readonly position: Phaser.Math.Vector2,
    ) {
        this.visual = drawCup(scene, position.x, position.y);
    }

    /**
     * Called every physics step for each rolling ball. A ball over the cup
     * drops in if it's slow enough; if not, it catches the rim and rolls on,
     * turned away from the hole (more the further off-centre it was).
     */
    check(body: MatterJS.BodyType, state: BallCourseState): CupResult | undefined {
        const dx = this.position.x - body.position.x;
        const dy = this.position.y - body.position.y;

        if (Math.hypot(dx, dy) > CUP_RADIUS) {
            state.lipping = false;
            return undefined;
        }

        // Still rolling over it after a lip-out
        if (state.lipping) {
            return undefined;
        }

        const speed = body.speed;

        if (speed <= CUP_MAX_SPEED) {
            return "sink";
        }

        state.lipping = true;

        // Which side of the ball's path the hole is on, and how far off
        const vx = body.velocity.x / speed;
        const vy = body.velocity.y / speed;
        const side = vx * dy - vy * dx;
        const offCentre = Math.min(1, Math.abs(side) / CUP_RADIUS);
        const turn = -Math.sign(side || 1) * LIP_TURN * offCentre;

        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const nextSpeed = speed * LIP_SLOWDOWN;

        this.scene.matter.body.setVelocity(body, {
            x: (vx * cos - vy * sin) * nextSpeed,
            y: (vx * sin + vy * cos) * nextSpeed,
        });

        return "lip";
    }

    destroy() {
        this.visual.destroy();
    }
}
