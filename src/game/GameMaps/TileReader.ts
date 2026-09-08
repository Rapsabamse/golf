import { SpawnLine } from "../GameHelpers/SpawnLine";
import { Goal } from "./Goal";
import { GeneratedMap } from "./Type";
import * as Phaser from "phaser";

export class TiledMapLoader {
    constructor(private readonly tileSize = 40) {}

    load(scene: Phaser.Scene, key: string): GeneratedMap {
        const map = scene.make.tilemap({ key });

        const grassTileset = map.addTilesetImage("Grass", "grass");

        if (!grassTileset) {
            throw new Error("Failed to load Grass tileset");
        }

        const groundLayer = map.createLayer("Ground", grassTileset, 0, 0);

        if (!groundLayer) {
            throw new Error("Failed to create Ground layer");
        }

        //Create objects

        const objectsLayer = map.getObjectLayer("Objects");

        if (!objectsLayer) {
            throw new Error("Map does not contain an Objects layer");
        }

        const bodies: MatterJS.BodyType[] = [];

        let goalPosition: Phaser.Math.Vector2 | undefined;
        let spawnLine: SpawnLine | undefined;

        for (const object of objectsLayer.objects) {
            switch (object.name) {
                case "Wall":
                    this.createWall(scene, object, bodies);
                    break;

                case "Goal":
                    goalPosition = new Phaser.Math.Vector2(object.x, object.y);
                    break;

                case "SpawnLine":
                    spawnLine = this.createSpawnLine(object);
                    break;
            }
        }

        if (!goalPosition) {
            throw new Error("Map does not contain a Goal");
        }

        if (!spawnLine) {
            throw new Error("Map does not contain a SpawnLine");
        }

        const goal = new Goal(scene, goalPosition);

        return {
            goal,

            getBallSpawnPosition(playerIndex, playerCount) {
                return spawnLine!.getPosition(playerIndex, playerCount);
            },

            destroy() {
                for (const body of bodies) {
                    scene.matter.world.remove(body);
                }

                goal.destroy();
            },
        };
    }

    private createWall(
        scene: Phaser.Scene,
        object: Phaser.Types.Tilemaps.TiledObject,
        bodies: MatterJS.BodyType[],
    ) {
        if (!object.polygon || object.polygon.length < 3) {
            console.warn(`Wall "${object.name}" has an invalid polygon`);
            return;
        }

        const points = object.polygon.map((point) => ({
            x: point.x,
            y: point.y,
        }));

        // Get color from Tiled
        const colorProperty = object.properties?.find(
            (property) => property.name === "color",
        );

        const color = colorProperty?.value ?? "#555555";

        // Visual
        const graphics = scene.add.graphics();

        graphics.fillStyle(
            Phaser.Display.Color.HexStringToColor(color).color,
            1,
        );

        graphics.beginPath();
        graphics.moveTo(object.x + points[0].x, object.y + points[0].y);

        for (let i = 1; i < points.length; i++) {
            graphics.lineTo(object.x + points[i].x, object.y + points[i].y);
        }

        graphics.closePath();
        graphics.fillPath();

        //Collision

        const centroid = this.getPolygonCentroid(points);

        const localPoints = points.map((point) => ({
            x: point.x - centroid.x,
            y: point.y - centroid.y,
        }));

        const worldX = object.x + centroid.x;
        const worldY = object.y + centroid.y;

        const body = scene.matter.add.fromVertices(
            worldX,
            worldY,
            localPoints,
            {
                isStatic: true,
            },
        );

        bodies.push(body);
    }

    private getPolygonCentroid(points: { x: number; y: number }[]): {
        x: number;
        y: number;
    } {
        let area = 0;
        let x = 0;
        let y = 0;

        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];

            const cross = current.x * next.y - next.x * current.y;

            area += cross;
            x += (current.x + next.x) * cross;
            y += (current.y + next.y) * cross;
        }

        area *= 0.5;

        if (Math.abs(area) < 0.000001) {
            throw new Error("Cannot calculate centroid of degenerate polygon");
        }

        return {
            x: x / (6 * area),
            y: y / (6 * area),
        };
    }

    private createSpawnLine(
        object: Phaser.Types.Tilemaps.TiledObject,
    ): SpawnLine {
        if (!object.polyline || object.polyline.length < 2) {
            throw new Error("SpawnLine must contain at least two points");
        }

        const startPoint = object.polyline[0];
        const endPoint = object.polyline[object.polyline.length - 1];

        const start = new Phaser.Math.Vector2(
            object.x + startPoint.x,
            object.y + startPoint.y,
        );

        const end = new Phaser.Math.Vector2(
            object.x + endPoint.x,
            object.y + endPoint.y,
        );

        return new SpawnLine(start, end);
    }
}
