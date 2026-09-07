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

    private canInteract = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly getOwnBall: () => AimBall | undefined,
        private readonly network: Network,
    ) {
        this.aimLine = scene.add.graphics();

        this.createInputs(network);
    }

    private createInputs(network: Network) {
        this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (pointer.event.target !== this.scene.game.canvas) {
                return;
            }

            const ball = this.getOwnBall();

            if (!ball) {
                return;
            }

            this.isDragging = true;
        });

        this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!this.canInteract || !this.isDragging) {
                return;
            }

            const ball = this.getOwnBall();

            if (!ball) {
                return;
            }

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

            const velocity = direction.scale(force * this.forceMultiplier);

            network.sendShot(velocity);
        });
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

    updateCanInteract(canInteranct: boolean) {
        this.canInteract = canInteranct;
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
