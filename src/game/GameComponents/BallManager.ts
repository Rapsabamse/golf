import * as Phaser from "phaser";
import { GameMap } from "../../type/GameTypes";
import { BallLocation, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";

export interface Ball {
    visual: Phaser.GameObjects.Arc;
    body: MatterJS.BodyType;
}

export class BallManager {
    private balls = new Map<string, Ball>();
    private isSimulating = false;
    private isHost = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly gameMap: GameMap,
        private readonly getPlayerId: () => string,
        private readonly network: Network,
    ) {}

    updateBalls(players: Player[]) {
        const playerIds = new Set(players.map((player) => player.id));

        // Remove balls for players that left
        for (const [playerId, ball] of this.balls) {
            if (!playerIds.has(playerId)) {
                ball.visual.destroy();
                this.scene.matter.world.remove(ball.body);
                this.balls.delete(playerId);
            }
        }

        // Create/reposition balls
        players.forEach((player, index) => {
            const position = this.gameMap.getBallSpawnPosition(
                index,
                players.length,
            );

            let ball = this.balls.get(player.id);

            if (!ball) {
                const visual = this.scene.add
                    .circle(position.x, position.y, 15, 0xffffff)
                    .setStrokeStyle(2, 0x444444);

                const body = this.scene.matter.add.circle(
                    position.x,
                    position.y,
                    15,
                    {
                        restitution: 0.8,
                        friction: 0.1,
                        frictionAir: 0.02,
                    },
                );

                ball = { visual, body };

                this.balls.set(player.id, ball);
            }

            this.scene.matter.body.setPosition(ball.body, position);

            ball.visual.setPosition(position.x, position.y);
        });
    }

    updateBallLocations(ballLocations: BallLocation[]) {
        for (const location of ballLocations) {
            const ball = this.balls.get(location.playerId);

            if (!ball) {
                continue;
            }

            this.scene.matter.body.setPosition(ball.body, {
                x: location.x,
                y: location.y,
            });

            this.scene.matter.body.setVelocity(ball.body, {
                x: 0,
                y: 0,
            });
        }
    }

    getOwnBall(): Ball | undefined {
        return this.balls.get(this.getPlayerId());
    }

    update() {
        for (const ball of this.balls.values()) {
            ball.visual.setPosition(ball.body.position.x, ball.body.position.y);

            ball.visual.setRotation(ball.body.angle);
        }

        if (this.isSimulating && this.areAllBallsStopped()) {
            this.isSimulating = false;

            if (this.isHost) {
                this.network.sendSimulationResult(this.getBallPositions());
            } else {
                this.network.sendSimulationDone();
            }
        }
    }

    simulateRound(data: Player[], isHost: boolean) {
        this.isSimulating = true;
        this.isHost = isHost;

        //Go through each ball and add the velocity send by the server
        data.forEach((player) => {
            const ball = this.balls.get(player.id);
            if (ball && player.shot?.direction) {
                this.scene.matter.body.setVelocity(
                    ball.body,
                    player.shot.direction,
                );
            }
        });
    }

    private getBallPositions(): BallLocation[] {
        return Array.from(this.balls.entries()).map(([playerId, ball]) => ({
            playerId,
            x: ball.body.position.x,
            y: ball.body.position.y,
        }));
    }

    private areAllBallsStopped(): boolean {
        const stopThreshold = 0.05;

        for (const ball of this.balls.values()) {
            if (ball.body.speed > stopThreshold) {
                return false;
            }
        }

        return true;
    }
}
