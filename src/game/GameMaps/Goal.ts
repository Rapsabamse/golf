import * as Phaser from "phaser";

export class Goal {
    private readonly body: MatterJS.BodyType;

    private onBallEntered?: (ballBody: MatterJS.BodyType) => void;

    constructor(
        private readonly scene: Phaser.Scene,
        readonly position: Phaser.Math.Vector2,
    ) {
        // Visual
        scene.add.circle(position.x, position.y, 15, 0x000000).setDepth(1);

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

            if (ballBody) {
                this.onBallEntered?.(ballBody);
            }
        }
    };
}
