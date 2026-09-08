import * as Phaser from "phaser";
import { Goal } from "./Goal";

export interface GeneratedMap {
    goal: Goal;

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;

    destroy(): void;
}
