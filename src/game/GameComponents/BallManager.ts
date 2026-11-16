import * as Phaser from "phaser";
import { BallLocation, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { GeneratedMap } from "../GameMaps/Type";
import { SoundEffects } from "./SoundEffects";
import { FONTS } from "../ui/theme";

export interface Ball {
    visual: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
    body: MatterJS.BodyType;
    inWorld: boolean;
    color: number;
}

const BALLRADIUS = 12;
const LABEL_OFFSET_Y = BALLRADIUS + 8;
const DEFAULT_BALL_COLOR = 0xffffff;

/** Shot speed that counts as a full-power putt for sound volume. */
const FULL_POWER_SPEED = 40;
/** Impact speed that plays the loudest bounce. */
const LOUD_BOUNCE_SPEED = 15;
const MIN_BOUNCE_SPEED = 0.8;

const SINK_DURATION_MS = 250;

export function toCssColor(color: number) {
    return `#${color.toString(16).padStart(6, "0")}`;
}

export class BallManager {
    private balls = new Map<string, Ball>();
    private isSimulating = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private gameMap: GeneratedMap,
        private readonly getPlayerId: () => string,
        private readonly network: Network,
        private readonly getScoringPlayers: () => string[],
        private readonly sounds: SoundEffects,
    ) {
        scene.matter.world.on("collisionstart", this.handleCollision);

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scene.matter.world.off("collisionstart", this.handleCollision);
        });
    }

    updateBalls(players: Player[], clear: boolean) {
        const playerIds = new Set(players.map((player) => player.id));

        // Remove balls for players that left
        for (const [playerId, ball] of this.balls) {
            if (!playerIds.has(playerId) || clear) {
                this.destroyBall(ball);
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
                ball = this.createBall(position);
                this.balls.set(player.id, ball);
            }

            this.applyPlayerLook(ball, player);

            this.scene.matter.body.setPosition(ball.body, position);

            ball.visual.setPosition(position.x, position.y);
        });
    }

    /** Remove the balls of players who left, without moving anyone else's. */
    removeMissingPlayers(players: Player[]) {
        const playerIds = new Set(players.map((player) => player.id));

        for (const [playerId, ball] of this.balls) {
            if (!playerIds.has(playerId)) {
                this.destroyBall(ball);
                this.balls.delete(playerId);
            }
        }
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
        const scoringPlayers = this.getScoringPlayers();

        for (const [playerId, ball] of this.balls) {
            const hasScored = scoringPlayers.includes(playerId);

            if (hasScored) {
                ball.visual.setVisible(false);

                if (ball.inWorld) {
                    this.scene.matter.world.remove(ball.body);
                    ball.inWorld = false;
                }
            } else if (!ball.inWorld) {
                // Our local simulation sank this ball but the host's didn't:
                // bring it back
                this.scene.tweens.killTweensOf(ball.visual);
                ball.visual.setScale(1).setAlpha(1).setVisible(true);

                this.scene.matter.world.add(ball.body);
                ball.inWorld = true;
            }
        }
    }

    getOwnBall(): Ball | undefined {
        return this.balls.get(this.getPlayerId());
    }

    update() {
        for (const ball of this.balls.values()) {
            // A ball sinking into the cup is moved by its tween instead
            if (ball.inWorld) {
                ball.visual.setPosition(
                    ball.body.position.x,
                    ball.body.position.y,
                );
            }

            ball.label.setPosition(
                ball.visual.x,
                ball.visual.y - LABEL_OFFSET_Y,
            );
            ball.label.setVisible(ball.inWorld && ball.visual.visible);
        }

        if (this.isSimulating && this.areAllBallsStopped()) {
            this.isSimulating = false;

            console.log("Sending result");

            this.network.sendSimulationResult(this.getBallPositions());
        }
    }

    simulateRound(data: Player[]) {
        this.isSimulating = true;

        let strongestShot = 0;

        //Go through each ball and add the velocity send by the server
        data.forEach((player) => {
            const ball = this.balls.get(player.id);
            if (ball && player.shot?.direction) {
                this.scene.matter.body.setVelocity(
                    ball.body,
                    player.shot.direction,
                );

                strongestShot = Math.max(
                    strongestShot,
                    Math.hypot(player.shot.direction.x, player.shot.direction.y),
                );
            }
        });

        if (strongestShot > 0) {
            this.sounds.putt(strongestShot / FULL_POWER_SPEED);
        }
    }

    handleGoalReached(ballBody: MatterJS.BodyType) {
        for (const [playerId, ball] of this.balls) {
            if (ball.body === ballBody) {
                console.log("Player reached goal:", playerId);

                if (ball.inWorld) {
                    this.scene.matter.world.remove(ball.body);
                    ball.inWorld = false;
                }

                this.playSinkAnimation(ball);
                this.sounds.cup();

                this.network.sendGoalReached(playerId);
                return;
            }
        }

        console.warn("Goal reached by unknown ball");
    }

    setMap(gameMap: GeneratedMap) {
        this.gameMap = gameMap;
        this.isSimulating = false;
    }

    private createBall(position: Phaser.Math.Vector2): Ball {
        const visual = this.scene.add
            .circle(position.x, position.y, BALLRADIUS, DEFAULT_BALL_COLOR)
            .setDepth(1000);

        const label = this.scene.add
            .text(position.x, position.y - LABEL_OFFSET_Y, "", {
                fontFamily: FONTS.bold,
                fontSize: "24px",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 5,
            })
            .setOrigin(0.5, 1)
            .setDepth(1001);

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

        return {
            visual,
            label,
            body,
            inWorld: true,
            color: DEFAULT_BALL_COLOR,
        };
    }

    /** Colour the ball and name it after its player. */
    private applyPlayerLook(ball: Ball, player: Player) {
        const isOwn = player.id === this.getPlayerId();

        ball.color = player.color ?? DEFAULT_BALL_COLOR;

        ball.visual
            .setFillStyle(ball.color)
            // Your own ball gets a thicker outline so it's easy to spot
            .setStrokeStyle(isOwn ? 4 : 2, isOwn ? 0x000000 : 0x333333);

        ball.label
            .setText(isOwn ? `${player.name} (you)` : player.name)
            .setColor(toCssColor(ball.color));
    }

    /** Ball rolls into the cup and shrinks away, with a ring bursting from the hole. */
    private playSinkAnimation(ball: Ball) {
        const hole = this.gameMap.goal.position;

        this.scene.tweens.killTweensOf(ball.visual);

        this.scene.tweens.add({
            targets: ball.visual,
            x: hole.x,
            y: hole.y,
            scale: 0.2,
            alpha: 0,
            duration: SINK_DURATION_MS,
            ease: "Quad.easeIn",
            onComplete: () => {
                ball.visual.setVisible(false);
            },
        });

        const ring = this.scene.add
            .circle(hole.x, hole.y, 16)
            .setStrokeStyle(6, ball.color)
            .setDepth(999);

        this.scene.tweens.add({
            targets: ring,
            scale: 3.5,
            alpha: 0,
            duration: 800,
            delay: SINK_DURATION_MS * 0.6,
            ease: "Cubic.easeOut",
            onComplete: () => ring.destroy(),
        });

        const text = this.scene.add
            .text(hole.x, hole.y - 30, "In the hole!", {
                fontFamily: FONTS.bold,
                fontSize: "30px",
                color: toCssColor(ball.color),
                stroke: "#000000",
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setDepth(1002)
            .setAlpha(0);

        this.scene.tweens.add({
            targets: text,
            alpha: { from: 0, to: 1 },
            y: hole.y - 70,
            duration: 400,
            delay: SINK_DURATION_MS * 0.6,
            ease: "Back.easeOut",
            onComplete: () => {
                this.scene.tweens.add({
                    targets: text,
                    alpha: 0,
                    duration: 400,
                    delay: 700,
                    onComplete: () => text.destroy(),
                });
            },
        });
    }

    /** Play a bounce sound when a ball hits a wall or another ball. */
    private handleCollision = (
        event: Phaser.Physics.Matter.Events.CollisionStartEvent,
    ) => {
        for (const pair of event.pairs) {
            // The hole is a sensor; it makes its own sound
            if (pair.bodyA.isSensor || pair.bodyB.isSensor) {
                continue;
            }

            if (!this.isBallBody(pair.bodyA) && !this.isBallBody(pair.bodyB)) {
                continue;
            }

            const speed = Math.max(pair.bodyA.speed, pair.bodyB.speed);

            if (speed >= MIN_BOUNCE_SPEED) {
                this.sounds.bounce(speed / LOUD_BOUNCE_SPEED);
            }
        }
    };

    private isBallBody(body: MatterJS.BodyType) {
        for (const ball of this.balls.values()) {
            if (ball.body === body) {
                return true;
            }
        }

        return false;
    }

    private destroyBall(ball: Ball) {
        this.scene.tweens.killTweensOf(ball.visual);

        ball.visual.destroy();
        ball.label.destroy();

        if (ball.inWorld) {
            this.scene.matter.world.remove(ball.body);
        }
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
            if (playersWhoScored.includes(playerId) || !ball.inWorld) {
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
