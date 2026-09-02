import * as Phaser from "phaser";

export interface SpawnLine {
    start: Phaser.Math.Vector2;
    end: Phaser.Math.Vector2;
}

export abstract class GameMap {
    abstract create(scene: Phaser.Scene): void;

    abstract getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;
}
