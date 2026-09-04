import * as Phaser from "phaser";
import { GameMap } from "../../type/GameTypes";
import { createCourseWalls, createRectangle } from "../GameHelpers/MapHelpers";
import { SpawnLine } from "../GameHelpers/SpawnLine";

export class TestMap extends GameMap {
    spawnLine!: SpawnLine;

    create(scene: Phaser.Scene) {
        const courseWidth = 5000;
        const courseHeight = 5000;

        const backgroundWidth = 7000;
        const backgroundHeight = 7000;

        // Background, centered at (0, 0)
        scene.add.tileSprite(
            0,
            0,
            backgroundWidth,
            backgroundHeight,
            "background",
        );

        // Course walls, centered at (0, 0)
        createCourseWalls(scene, courseWidth, courseHeight);

        this.spawnLine = new SpawnLine(
            new Phaser.Math.Vector2(200, 300),
            new Phaser.Math.Vector2(800, 300),
        );

        createRectangle(scene, 700, 500, 100, 20, 0xffffff);
    }

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2 {
        return this.spawnLine.getPosition(playerIndex, playerCount);
    }
}
