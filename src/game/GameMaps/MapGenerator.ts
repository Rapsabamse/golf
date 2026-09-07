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

    destroy(): void;
}

export class MapGenerator {
    constructor(private readonly tileSize: number = 50) {}

    generate(scene: Phaser.Scene, map: string[]): GeneratedMap {
        const width = map[0].length * this.tileSize;
        const height = map.length * this.tileSize;

        const objects: Phaser.GameObjects.GameObject[] = [];
        const bodies: MatterJS.BodyType[] = [];

        const worldBackground = this.createWorldBackground(
            scene,
            width,
            height,
        );

        const background = this.createBackground(scene, width, height);

        objects.push(worldBackground, background);

        let goalPosition: Phaser.Math.Vector2 | undefined;

        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                const tile = map[y][x];

                const worldX = x * this.tileSize + this.tileSize / 2;
                const worldY = y * this.tileSize + this.tileSize / 2;

                switch (tile) {
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

        this.createWalls(scene, map, objects, bodies);

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

            destroy() {
                for (const object of objects) {
                    object.destroy();
                }

                for (const body of bodies) {
                    scene.matter.world.remove(body);
                }

                goal.destroy();
            },
        };
    }

    private createWalls(
        scene: Phaser.Scene,
        map: string[],
        objects: Phaser.GameObjects.GameObject[],
        bodies: MatterJS.BodyType[],
    ) {
        const height = map.length;
        const width = map[0].length;

        const processed = map.map(() => Array(width).fill(false));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (map[y][x] !== "x" || processed[y][x]) {
                    continue;
                }

                // Find the maximum horizontal width.
                let rectangleWidth = 1;

                while (
                    x + rectangleWidth < width &&
                    map[y][x + rectangleWidth] === "x" &&
                    !processed[y][x + rectangleWidth]
                ) {
                    rectangleWidth++;
                }

                // Find the maximum height for that width.
                let rectangleHeight = 1;

                while (y + rectangleHeight < height) {
                    let canExpand = true;

                    for (let dx = 0; dx < rectangleWidth; dx++) {
                        if (
                            map[y + rectangleHeight][x + dx] !== "x" ||
                            processed[y + rectangleHeight][x + dx]
                        ) {
                            canExpand = false;
                            break;
                        }
                    }

                    if (!canExpand) {
                        break;
                    }

                    rectangleHeight++;
                }

                // Mark all tiles covered by this rectangle.
                for (let dy = 0; dy < rectangleHeight; dy++) {
                    for (let dx = 0; dx < rectangleWidth; dx++) {
                        processed[y + dy][x + dx] = true;
                    }
                }

                const worldX = (x + rectangleWidth / 2) * this.tileSize;

                const worldY = (y + rectangleHeight / 2) * this.tileSize;

                const rectangleWorldWidth = rectangleWidth * this.tileSize;

                const rectangleWorldHeight = rectangleHeight * this.tileSize;

                const { visual, body } = createRectangle(
                    scene,
                    worldX,
                    worldY,
                    rectangleWorldWidth,
                    rectangleWorldHeight,
                    0xffffff,
                );

                objects.push(visual);
                bodies.push(body);
            }
        }
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
        return createRectangle(
            scene,
            x,
            y,
            this.tileSize,
            this.tileSize,
            0xffffff,
        );
    }

    private createWorldBackground(
        scene: Phaser.Scene,
        width: number,
        height: number,
    ) {
        return scene.add.tileSprite(
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
        return scene.add.tileSprite(
            width / 2,
            height / 2,
            width,
            height,
            "background",
        );
    }
}
