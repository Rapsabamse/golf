import * as Phaser from "phaser";
import { Goal } from "./Goal";

export interface GeneratedMap {
    goal: Goal;

    /** The area the course covers, in world coordinates. */
    bounds: Phaser.Geom.Rectangle;

    /** A ball hit this wall body (bumpers light up). */
    onWallHit(body: MatterJS.BodyType): void;


    /** Call every frame. */
    update(): void;

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;

    destroy(): void;
}
