import * as Phaser from "phaser";
import { createRectangle } from "../GameHelpers/MapHelpers";
import { SpawnLine } from "../GameHelpers/SpawnLine";
import { Goal } from "./Goal";

export interface GeneratedMap {
    goal: Goal;

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;
}

export class MapGenerator {
    constructor(private readonly tileSize: number = 50) {}

    generate(scene: Phaser.Scene, map: string[]): GeneratedMap {
        const width = map[0].length * this.tileSize;
        const height = map.length * this.tileSize;

        this.createWorldBackground(scene, width, height);
        this.createBackground(scene, width, height);

        let goalPosition: Phaser.Math.Vector2 | undefined;

        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                const tile = map[y][x];

                const worldX = x * this.tileSize + this.tileSize / 2;
                const worldY = y * this.tileSize + this.tileSize / 2;

                switch (tile) {
                    case "x":
                        this.createWall(scene, worldX, worldY);
                        break;

                    case "g":
                        goalPosition = new Phaser.Math.Vector2(worldX, worldY);
                        break;

                    case " ":
                    case "s":
                        break;

                    default:
                        console.warn(
                            `Unknown map tile '${tile}' at ${x}, ${y}`,
                        );
                        break;
                }
            }
        }

        if (!goalPosition) {
            throw new Error("Map does not contain a goal");
        }

        const goal = new Goal(scene, goalPosition);

        const spawnLine = this.createSpawnLine(map);

        return {
            goal,

            getBallSpawnPosition(
                playerIndex: number,
                playerCount: number,
            ): Phaser.Math.Vector2 {
                return spawnLine.getPosition(playerIndex, playerCount);
            },
        };
    }

    private createSpawnLine(map: string[]): SpawnLine {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                if (map[y][x] !== "s") {
                    continue;
                }

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        if (minX === Infinity) {
            throw new Error("Map does not contain a spawn line");
        }

        const start = new Phaser.Math.Vector2(
            minX * this.tileSize + this.tileSize / 2,
            minY * this.tileSize + this.tileSize / 2,
        );

        const end = new Phaser.Math.Vector2(
            maxX * this.tileSize + this.tileSize / 2,
            maxY * this.tileSize + this.tileSize / 2,
        );

        return new SpawnLine(start, end);
    }

    private createWall(scene: Phaser.Scene, x: number, y: number) {
        createRectangle(scene, x, y, this.tileSize, this.tileSize, 0xffffff);
    }

    private createWorldBackground(
        scene: Phaser.Scene,
        width: number,
        height: number,
    ) {
        scene.add.tileSprite(
            width / 2,
            height / 2,
            width * 3,
            height * 3,
            "worldBackground",
        );
    }

    private createBackground(
        scene: Phaser.Scene,
        width: number,
        height: number,
    ) {
        scene.add.tileSprite(
            width / 2,
            height / 2,
            width,
            height,
            "background",
        );
    }
}
