import * as Phaser from "phaser";
import { Goal } from "./Goal";

export interface GeneratedMap {
    goal: Goal;

    /** The area the course covers, in world coordinates. */
    bounds: Phaser.Geom.Rectangle;

    /** Fit the starfield behind the course to a screen of this size. */
    resizeBackground(width: number, height: number): void;

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;

    destroy(): void;
}
