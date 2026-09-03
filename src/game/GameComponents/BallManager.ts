import * as Phaser from "phaser";
import { GameMap } from "../../type/GameTypes";
import { Player } from "../../../server/types/types";

export interface Ball {
    visual: Phaser.GameObjects.Arc;
    body: MatterJS.BodyType;
}

export class BallManager {
    private balls = new Map<string, Ball>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly gameMap: GameMap,
        private readonly getPlayerId: () => string,
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
                const isOwnBall = player.id === this.getPlayerId();

                const visual = this.scene.add.circle(
                    position.x,
                    position.y,
                    15,
                    isOwnBall ? 0xff69b4 : 0xffffff,
                );

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

    getOwnBall(): Ball | undefined {
        return this.balls.get(this.getPlayerId());
    }

    update() {
        for (const ball of this.balls.values()) {
            ball.visual.setPosition(ball.body.position.x, ball.body.position.y);

            ball.visual.setRotation(ball.body.angle);
        }
    }

    simulateRound(data: any) {
        console.log(data);

        //läs in data korrekt
        //Simulera alla slag (Lägg in velocityn på rätt bollar)
    }
}
