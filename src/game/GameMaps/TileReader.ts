import { SpawnLine } from "../GameHelpers/SpawnLine";
import { Goal } from "./Goal";
import { GeneratedMap } from "./Type";
import * as Phaser from "phaser";

type TiledObject = Phaser.Types.Tilemaps.TiledObject;

/** How many corners the collision shape of an ellipse wall gets. */
const ELLIPSE_SEGMENTS = 24;

/** Read the "color" property set on an object in Tiled, or the default wall color. */
function getWallColor(object: TiledObject): number {
    const colorProperty = (
        object.properties as { name: string; value: unknown }[] | undefined
    )?.find((property) => property.name === "color");

    const color =
        typeof colorProperty?.value === "string"
            ? colorProperty.value
            : "#555555";

    return Phaser.Display.Color.HexStringToColor(color).color;
}

/** Read a true/false property set on an object in Tiled. */
function getBooleanProperty(
    object: TiledObject,
    name: string,
): boolean | undefined {
    const property = (
        object.properties as { name: string; value: unknown }[] | undefined
    )?.find((candidate) => candidate.name === name);

    return typeof property?.value === "boolean" ? property.value : undefined;
}

export class TiledMapLoader {
    load(scene: Phaser.Scene, key: string): GeneratedMap {
        const map = scene.make.tilemap({ key });

        const bodies: MatterJS.BodyType[] = [];
        const wallGraphics: Phaser.GameObjects.Graphics[] = [];

        // Add the background. It doesn't scroll, but it is scaled by the
        // camera zoom, so it is made big enough to cover the screen when
        // zoomed all the way out.
        const background = scene.add
            .tileSprite(0, 0, 1, 1, "space")
            .setScrollFactor(0)
            .setDepth(-100);

        const resizeBackground = (width: number, height: number) => {
            background
                .setPosition(width / 2, height / 2)
                .setSize(width * 4, height * 4);
        };

        resizeBackground(scene.scale.width, scene.scale.height);

        const grassTileset = map.addTilesetImage("Grass", "grass");

        if (!grassTileset) {
            throw new Error("Failed to load Grass tileset");
        }

        const groundLayer = map.createLayer("Ground", grassTileset, 0, 0);

        if (!groundLayer) {
            throw new Error("Failed to create Ground layer");
        }

        // Create objects
        const objectsLayer = map.getObjectLayer("Objects");

        if (!objectsLayer) {
            throw new Error("Map does not contain an Objects layer");
        }

        let goalPosition: Phaser.Math.Vector2 | undefined;
        let spawnLine: SpawnLine | undefined;

        for (const object of objectsLayer.objects) {
            switch (object.name) {
                case "Wall": {
                    const drawnBefore = wallGraphics.length;
                    const bodiesBefore = bodies.length;

                    this.createWall(scene, object, bodies, wallGraphics);

                    // Hidden walls (visible unticked in Tiled) still block
                    // balls. Maps put a thick hidden wall under each thin
                    // rail, because a full-power ball can pass straight
                    // through a 40px wall in one physics step.
                    if (object.visible === false) {
                        for (const graphics of wallGraphics.slice(drawnBefore)) {
                            graphics.setVisible(false);
                        }
                    }

                    // Walls with the property solid = false are only drawn
                    // (the rails on top of those hidden walls)
                    if (getBooleanProperty(object, "solid") === false) {
                        for (const body of bodies.splice(bodiesBefore)) {
                            scene.matter.world.remove(body);
                        }
                    }
                    break;
                }

                case "Goal":
                    goalPosition = new Phaser.Math.Vector2(
                        object.x ?? 0,
                        object.y ?? 0,
                    );
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

            resizeBackground,

            bounds: new Phaser.Geom.Rectangle(
                0,
                0,
                map.widthInPixels,
                map.heightInPixels,
            ),

            getBallSpawnPosition(playerIndex, playerCount) {
                return spawnLine!.getPosition(playerIndex, playerCount);
            },

            destroy() {
                for (const body of bodies) {
                    scene.matter.world.remove(body);
                }

                for (const graphics of wallGraphics) {
                    graphics.destroy();
                }

                groundLayer.destroy();
                background.destroy();
                goal.destroy();
            },
        };
    }

    private createWall(
        scene: Phaser.Scene,
        object: TiledObject,
        bodies: MatterJS.BodyType[],
        wallGraphics: Phaser.GameObjects.Graphics[],
    ) {
        // Polygon wall
        if (object.polygon && object.polygon.length >= 3) {
            this.createPolygonWall(scene, object, bodies, wallGraphics);
            return;
        }

        // Ellipse wall
        if (object.ellipse) {
            this.createEllipseWall(scene, object, bodies, wallGraphics);
            return;
        }

        // Rectangle wall
        if (object.width !== undefined && object.height !== undefined) {
            this.createRectangleWall(scene, object, bodies, wallGraphics);
            return;
        }

        console.warn(`Wall "${object.name}" has invalid geometry`);
    }

    private createEllipseWall(
        scene: Phaser.Scene,
        object: TiledObject,
        bodies: MatterJS.BodyType[],
        wallGraphics: Phaser.GameObjects.Graphics[],
    ) {
        const width = object.width ?? 0;
        const height = object.height ?? 0;

        const x = (object.x ?? 0) + width / 2;
        const y = (object.y ?? 0) + height / 2;

        // Visual
        const graphics = scene.add.graphics();

        graphics.fillStyle(getWallColor(object), 1);
        graphics.fillEllipse(x, y, width, height);

        wallGraphics.push(graphics);

        // Collision: a polygon that follows the ellipse, so the ball bounces
        // where the wall is drawn (a circle only fits if width === height)
        const vertices = Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
            const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;

            return {
                x: (Math.cos(angle) * width) / 2,
                y: (Math.sin(angle) * height) / 2,
            };
        });

        const body = scene.matter.add.fromVertices(x, y, vertices, {
            isStatic: true,
        });

        bodies.push(body);
    }

    private createRectangleWall(
        scene: Phaser.Scene,
        object: TiledObject,
        bodies: MatterJS.BodyType[],
        wallGraphics: Phaser.GameObjects.Graphics[],
    ) {
        const left = object.x ?? 0;
        const top = object.y ?? 0;
        const width = object.width ?? 0;
        const height = object.height ?? 0;

        // Visual
        const graphics = scene.add.graphics();

        graphics.fillStyle(getWallColor(object), 1);
        graphics.fillRect(left, top, width, height);

        wallGraphics.push(graphics);

        // Collision
        const body = scene.matter.add.rectangle(
            left + width / 2,
            top + height / 2,
            width,
            height,
            {
                isStatic: true,
            },
        );

        bodies.push(body);
    }

    private createPolygonWall(
        scene: Phaser.Scene,
        object: TiledObject,
        bodies: MatterJS.BodyType[],
        wallGraphics: Phaser.GameObjects.Graphics[],
    ) {
        const originX = object.x ?? 0;
        const originY = object.y ?? 0;

        const points = object.polygon!.map((point) => ({
            x: point.x,
            y: point.y,
        }));

        // Visual
        const graphics = scene.add.graphics();

        graphics.fillStyle(getWallColor(object), 1);

        graphics.beginPath();
        graphics.moveTo(originX + points[0].x, originY + points[0].y);

        for (let i = 1; i < points.length; i++) {
            graphics.lineTo(originX + points[i].x, originY + points[i].y);
        }

        graphics.closePath();
        graphics.fillPath();

        wallGraphics.push(graphics);

        // Collision
        const centroid = this.getPolygonCentroid(points);

        const localPoints = points.map((point) => ({
            x: point.x - centroid.x,
            y: point.y - centroid.y,
        }));

        const worldX = originX + centroid.x;
        const worldY = originY + centroid.y;

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

    private createSpawnLine(object: TiledObject): SpawnLine {
        if (!object.polyline || object.polyline.length < 2) {
            throw new Error("SpawnLine must contain at least two points");
        }

        const startPoint = object.polyline[0];
        const endPoint = object.polyline[object.polyline.length - 1];

        const start = new Phaser.Math.Vector2(
            (object.x ?? 0) + startPoint.x,
            (object.y ?? 0) + startPoint.y,
        );

        const end = new Phaser.Math.Vector2(
            (object.x ?? 0) + endPoint.x,
            (object.y ?? 0) + endPoint.y,
        );

        return new SpawnLine(start, end);
    }
}
