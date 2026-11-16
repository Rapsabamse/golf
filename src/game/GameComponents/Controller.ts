import * as Phaser from "phaser";
import { Network } from "../Networking/Network";

export interface AimBall {
    visual: Phaser.GameObjects.Arc;
    body: MatterJS.BodyType;
}

export class AimController {
    private isDragging = false;
    private aimLine: Phaser.GameObjects.Graphics;

    private readonly maxForce = 160;
    private readonly chargeSensitivity = 0.5;
    private readonly forceMultiplier = 0.25;
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
                    this.aimLine.clear();
                }
                return;
            }

            const velocity = direction.scale(force * this.forceMultiplier);

            this.network.sendShot(velocity);
            this.shotSelected = true;
        });
    }

    private updateAimline(pointer: Phaser.Input.Pointer, ball: AimBall) {
        const { direction, force } = this.calculateLaunch(pointer);

        this.aimLine.clear();
        this.aimLine.lineStyle(3, 0xffffff);

        const endX =
            ball.visual.x + direction.x * force * this.aimLineMultiplier;

        const endY =
            ball.visual.y + direction.y * force * this.aimLineMultiplier;

        this.aimLine.beginPath();
        this.aimLine.moveTo(ball.visual.x, ball.visual.y);
        this.aimLine.lineTo(endX, endY);
        this.aimLine.strokePath();
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
        this.aimLine.clear();
    }

    clearAimline() {
        this.aimLine.clear();
    }

    destroy() {
        this.aimLine.destroy();

        this.scene.input.off("pointerdown");
        this.scene.input.off("pointermove");
        this.scene.input.off("pointerup");
    }
}
