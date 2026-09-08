import * as Phaser from "phaser";

const GOAL_BRAKE_FACTOR = 0.2;
const GOAL_SPEED_THRESHOLD = 3;

export class Goal {
    private readonly body: MatterJS.BodyType;
    private readonly visual: Phaser.GameObjects.Arc;

    private onBallEntered?: (ballBody: MatterJS.BodyType) => void;

    constructor(
        private readonly scene: Phaser.Scene,
        readonly position: Phaser.Math.Vector2,
    ) {
        // Visual
        this.visual = scene.add
            .circle(position.x, position.y, 15, 0x000000)
            .setDepth(1);

        // Physics sensor
        this.body = scene.matter.add.circle(position.x, position.y, 15, {
            isStatic: true,
            isSensor: true,
        });

        scene.matter.world.on("collisionstart", this.handleCollision);
    }

    setOnBallEntered(callback: (ballBody: MatterJS.BodyType) => void) {
        this.onBallEntered = callback;
    }

    private handleCollision = (
        event: Phaser.Physics.Matter.Events.CollisionStartEvent,
    ) => {
        for (const pair of event.pairs) {
            let ballBody: MatterJS.BodyType | undefined;

            if (pair.bodyA === this.body) {
                ballBody = pair.bodyB;
            } else if (pair.bodyB === this.body) {
                ballBody = pair.bodyA;
            }

            if (!ballBody) {
                continue;
            }

            //Slow down the ball when it collides with the goal
            const velocity = {
                x: ballBody.velocity.x * GOAL_BRAKE_FACTOR,
                y: ballBody.velocity.y * GOAL_BRAKE_FACTOR,
            };

            this.scene.matter.body.setVelocity(ballBody, velocity);

            //Check if the ball is under the threshold for a collision to count as a goal
            const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
            if (speed <= GOAL_SPEED_THRESHOLD) {
                this.onBallEntered?.(ballBody);
            }
        }
    };

    destroy() {
        this.scene.matter.world.off("collisionstart", this.handleCollision);

        this.scene.matter.world.remove(this.body);
        this.visual.destroy();
    }
}
