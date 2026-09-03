import * as Phaser from "phaser";
import { GameMap } from "../../type/GameTypes";
import { createCourseWalls } from "../GameHelpers/CreateWalls";
import { SpawnLine } from "../GameHelpers/SpawnLine";
import { createObstacle } from "../GameHelpers/CreateObstacle";

export class TestMap extends GameMap {
    spawnLine!: SpawnLine;

    create(scene: Phaser.Scene) {
        scene.add.image(512, 384, "background");

        createCourseWalls(scene);

        this.spawnLine = new SpawnLine(
            new Phaser.Math.Vector2(200, 300),
            new Phaser.Math.Vector2(800, 300),
        );

        // Create objects
        createObstacle(scene, 700, 500, 100, 20, 0xffffff);
    }

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2 {
        return this.spawnLine.getPosition(playerIndex, playerCount);
    }
}
