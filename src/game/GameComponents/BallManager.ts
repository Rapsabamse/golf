import * as Phaser from "phaser";
import { BallLocation, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { GeneratedMap } from "../GameMaps/MapGenerator";

export interface Ball {
    visual: Phaser.GameObjects.Arc;
    body: MatterJS.BodyType;
}

const BALLRADIUS = 12;

export class BallManager {
    private balls = new Map<string, Ball>();
    private isSimulating = false;
    private isHost = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly gameMap: GeneratedMap,
        private readonly getPlayerId: () => string,
        private readonly network: Network,
        private readonly getScoringPlayers: () => string[],
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
                    .circle(position.x, position.y, BALLRADIUS, 0xffffff)
                    .setStrokeStyle(2, 0x444444);

                const body = this.scene.matter.add.circle(
                    position.x,
                    position.y,
                    BALLRADIUS,
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

    updateScoringPlayers() {
        for (const [playerId, ball] of this.balls) {
            const hasScored = this.getScoringPlayers().includes(playerId);

            ball.visual.setVisible(!hasScored);

            if (hasScored) {
                this.scene.matter.world.remove(ball.body);
            } else {
                this.scene.matter.world.add(ball.body);
            }
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
                console.log("Sending result");

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

    handleGoalReached(ballBody: MatterJS.BodyType) {
        for (const [playerId, ball] of this.balls) {
            if (ball.body === ballBody) {
                console.log("Player reached goal:", playerId);

                this.network.sendGoalReached(playerId);
                return;
            }
        }

        console.warn("Goal reached by unknown ball");
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
        const playersWhoScored = this.getScoringPlayers();

        for (const [playerId, ball] of this.balls) {
            if (playersWhoScored.includes(playerId)) {
                continue;
            }

            if (ball.body.speed > stopThreshold) {
                return false;
            }
        }

        console.log("all balls stopped!");

        return true;
    }
}
