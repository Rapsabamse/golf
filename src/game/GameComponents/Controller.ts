import * as Phaser from "phaser";
import { Network } from "../Networking/Network";

export interface AimBall {
    visual: Phaser.GameObjects.Arc;
    body: MatterJS.BodyType;
    label?: Phaser.GameObjects.Text;
}

/*
 * The aim arrow: rectangles that grow with the shot's power, split by a gap
 * at every quarter of full power, and always ending in a triangle as wide
 * as the rectangles:  =>  ==>  ===>  ====>
 */
/** Gap between the ball's edge and the arrow (world px). */
const ARROW_START = 24;
const QUARTERS = 4;
const BAR_HALF_WIDTH = 9;
/** Space between the rectangles, and between the last one and the triangle. */
const QUARTER_GAP = 8;
const HEAD_LENGTH = 22;
/** Your name label fades while the arrow is up so it doesn't cover it. */
const LABEL_ALPHA_WHILE_AIMING = 0.2;

const CHARGED_COLOR = 0xffffff;
/** Full power gets its own colour so you know you can't hit harder. */
const MAX_COLOR = 0xffd84d;
const OUTLINE_COLOR = 0x0b1408;

export class AimController {
    private isDragging = false;
    private aimLine: Phaser.GameObjects.Graphics;

    /** Tells the power bar the current charge (0..1), or undefined when not aiming. */
    onChargeChange?: (charge: number | undefined) => void;

    private readonly maxForce = 160;
    private readonly chargeSensitivity = 0.5;
    private readonly forceMultiplier = 0.25;
    /** Full arrow length in world px is maxForce * aimLineMultiplier. */
    private readonly aimLineMultiplier = 2;
    /** Shots weaker than this are treated as a click, not a shot. */
    private readonly minForce = 1;

    private canInteract = false;
    private shotSelected = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly getOwnBall: () => AimBall | undefined,
        private readonly network: Network,
    ) {
        this.aimLine = scene.add.graphics().setDepth(99);

        this.createInputs();
    }

    private createInputs() {
        this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (
                pointer.event.target !== this.scene.game.canvas ||
                !this.canInteract
            ) {
                return;
            }

            const ball = this.getOwnBall();

            if (!ball) {
                return;
            }

            this.isDragging = true;
            this.updateAimline(pointer, ball);
        });

        this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!this.canInteract || !this.isDragging) {
                return;
            }

            const ball = this.getOwnBall();

            if (!ball) {
                return;
            }

            this.updateAimline(pointer, ball);
        });

        this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (!this.canInteract || !this.isDragging) {
                return;
            }

            this.isDragging = false;

            const ball = this.getOwnBall();

            if (!ball) {
                return;
            }

            const { direction, force } = this.calculateLaunch(pointer);

            // A click without dragging doesn't replace the current shot
            if (force < this.minForce) {
                if (!this.shotSelected) {
                    this.clearAimline();
                }
                return;
            }

            const velocity = direction.scale(force * this.forceMultiplier);

            this.network.sendShot(velocity);
            this.shotSelected = true;

            // The arrow stays up, showing the shot you picked
        });
    }

    private updateAimline(pointer: Phaser.Input.Pointer, ball: AimBall) {
        const { direction, force } = this.calculateLaunch(pointer);

        this.drawArrow(ball.visual.x, ball.visual.y, direction, force / this.maxForce);
    }

    /**
     * Draw the segmented arrow from the ball. `charge` is 0..1 of max power.
     */
    private drawArrow(
        x: number,
        y: number,
        direction: Phaser.Math.Vector2,
        charge: number,
    ) {
        this.aimLine.clear();

        if (charge <= 0 || direction.lengthSq() === 0) {
            this.onChargeChange?.(undefined);
            this.setOwnLabelFaded(false);
            return;
        }

        this.setOwnLabelFaded(true);

        const isMax = charge >= 0.999;
        const fillColor = isMax ? MAX_COLOR : CHARGED_COLOR;

        // Full power: four whole rectangles, then the triangle
        const maxShaftLength =
            this.maxForce * this.aimLineMultiplier - HEAD_LENGTH;
        const quarterLength = maxShaftLength / QUARTERS;
        const shaftLength = charge * maxShaftLength;

        // Direction along the arrow (u) and across it (v)
        const normalX = -direction.y;
        const normalY = direction.x;

        const toWorld = (u: number, v: number) =>
            new Phaser.Math.Vector2(
                x + direction.x * (ARROW_START + u) + normalX * v,
                y + direction.y * (ARROW_START + u) + normalY * v,
            );

        const shapes: Phaser.Math.Vector2[][] = [];
        let shaftEnd = 0;

        // One rectangle per quarter reached; the current one grows
        for (let quarter = 0; quarter < QUARTERS; quarter++) {
            const start = quarter * quarterLength;
            const end = Math.min((quarter + 1) * quarterLength, shaftLength);

            // Leave the gap that separates this quarter from the next
            const visibleEnd = Math.min(
                end,
                (quarter + 1) * quarterLength - QUARTER_GAP,
            );

            if (visibleEnd - start < 1) {
                break;
            }

            shapes.push([
                toWorld(start, -BAR_HALF_WIDTH),
                toWorld(visibleEnd, -BAR_HALF_WIDTH),
                toWorld(visibleEnd, BAR_HALF_WIDTH),
                toWorld(start, BAR_HALF_WIDTH),
            ]);

            shaftEnd = visibleEnd;
        }

        // The triangle always closes the arrow, one gap after the last rectangle
        const headStart = shapes.length > 0 ? shaftEnd + QUARTER_GAP : 0;
        shapes.push([
            toWorld(headStart, -BAR_HALF_WIDTH),
            toWorld(headStart + HEAD_LENGTH, 0),
            toWorld(headStart, BAR_HALF_WIDTH),
        ]);

        for (const points of shapes) {
            this.aimLine.fillStyle(fillColor, 1);
            this.aimLine.fillPoints(points, true);

            this.aimLine.lineStyle(2.5, OUTLINE_COLOR, 0.7);
            this.aimLine.strokePoints(points, true);
        }

        this.onChargeChange?.(charge);
    }

    private calculateLaunch(pointer: Phaser.Input.Pointer) {
        const ball = this.getOwnBall();

        if (!ball) {
            return {
                direction: new Phaser.Math.Vector2(),
                force: 0,
            };
        }

        const dx = ball.visual.x - pointer.worldX;
        const dy = ball.visual.y - pointer.worldY;

        const distance = Math.sqrt(dx * dx + dy * dy);

        const force = Math.min(
            distance * this.chargeSensitivity,
            this.maxForce,
        );

        const direction = new Phaser.Math.Vector2(dx, dy);

        if (direction.lengthSq() > 0) {
            direction.normalize();
        }

        return {
            direction,
            force,
        };
    }

    updateCanInteract(canInteract: boolean) {
        this.canInteract = canInteract;

        if (!canInteract) {
            this.isDragging = false;
        }
    }

    hasSelectedShot() {
        return this.shotSelected;
    }

    /** Forget the shot from the last planning phase. */
    resetShot() {
        this.shotSelected = false;
        this.isDragging = false;
        this.clearAimline();
    }

    clearAimline() {
        this.aimLine.clear();
        this.onChargeChange?.(undefined);
        this.setOwnLabelFaded(false);
    }

    private setOwnLabelFaded(faded: boolean) {
        this.getOwnBall()?.label?.setAlpha(
            faded ? LABEL_ALPHA_WHILE_AIMING : 1,
        );
    }

    destroy() {
        this.aimLine.destroy();

        this.scene.input.off("pointerdown");
        this.scene.input.off("pointermove");
        this.scene.input.off("pointerup");
    }
}
