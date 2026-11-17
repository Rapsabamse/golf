import { SpawnLine } from "../GameHelpers/SpawnLine";
import { Goal } from "./Goal";
import { GeneratedMap } from "./Type";
import * as Phaser from "phaser";
import { CourseBake } from "./CourseBake";
import {
    DEPTH,
    TURF_TEXTURE,
    drawCourseSurface,
    drawTee,
    drawWall,
    ensureTurfTexture,
    findSharedEdges,
    flashBumper,
    getMaterial,
} from "./CourseArt";

type Point = { x: number; y: number };

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

/** Read a text property set on an object in Tiled. */
function getStringProperty(object: TiledObject, name: string) {
    const property = (
        object.properties as { name: string; value: unknown }[] | undefined
    )?.find((candidate) => candidate.name === name);

    return typeof property?.value === "string" ? property.value : undefined;
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

        // Everything added from here on that never changes is drawn once (see below)
        const existing = new Set(scene.children.list);

        const bodies: MatterJS.BodyType[] = [];
        const wallGraphics: Phaser.GameObjects.Graphics[] = [];
        const bumperFlashes = new Map<MatterJS.BodyType, Phaser.GameObjects.Graphics>();
        // Walls built from pieces (a "group" property in Tiled), drawn as one
        const groups = new Map<string, { points: Point[]; object: TiledObject }[]>();

        // The maps use the Grass tileset; it is drawn with the generated
        // putting-green turf, which has the same layout
        ensureTurfTexture(scene);
        const grassTileset = map.addTilesetImage("Grass", TURF_TEXTURE);

        if (!grassTileset) {
            throw new Error("Failed to load Grass tileset");
        }

        const groundLayer = map.createLayer("Ground", grassTileset, 0, 0);

        if (!groundLayer) {
            throw new Error("Failed to create Ground layer");
        }

        // Mown stripes, and the course's shadow on the stars
        const surface = drawCourseSurface(
            scene,
            (col, row) => !!map.getTileAt(col, row, false, "Ground"),
            map.width,
            map.height,
        );

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

                    this.createWall(
                        scene,
                        object,
                        bodies,
                        wallGraphics,
                        bumperFlashes,
                        groups,
                    );

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

        // Draw grouped walls now that all their pieces are known
        for (const pieces of groups.values()) {
            const isShared = findSharedEdges(pieces.map((piece) => piece.points));

            for (const { points, object } of pieces) {
                const art = drawWall(
                    scene,
                    points,
                    getWallColor(object),
                    getMaterial(object.properties),
                    isShared,
                );
                wallGraphics.push(art.shadow, art.body);
            }
        }

        if (!goalPosition) {
            throw new Error("Map does not contain a Goal");
        }

        if (!spawnLine) {
            throw new Error("Map does not contain a SpawnLine");
        }

        const goal = new Goal(scene, goalPosition);
        const tee = drawTee(scene, spawnLine.start, spawnLine.end);

        const bounds = new Phaser.Geom.Rectangle(
            0,
            0,
            map.widthInPixels,
            map.heightInPixels,
        );

        // The course art up to the walls never changes: draw it into one
        // texture. Bumper flashes, the flag and the balls stay live above it.
        const bake = new CourseBake(
            scene,
            scene.children.list.filter((object) => {
                const item = object as unknown as Phaser.GameObjects.Components.Depth &
                    Phaser.GameObjects.Components.Visible;
                return !existing.has(object) && item.visible && item.depth <= DEPTH.wall;
            }),
            bounds,
            DEPTH.floatShadow,
        );

        return {
            goal,

            onWallHit(body) {
                const flash = bumperFlashes.get(body);
                if (flash) {
                    flashBumper(scene, flash);
                }
            },

            bounds,

            update() {
                bake.update();
            },

            getBallSpawnPosition(playerIndex, playerCount) {
                return spawnLine!.getPosition(playerIndex, playerCount);
            },

            destroy() {
                bake.destroy();

                for (const body of bodies) {
                    scene.matter.world.remove(body);
                }

                for (const graphics of wallGraphics) {
                    graphics.destroy();
                }

                groundLayer.destroy();
                tee.destroy();

                for (const graphics of surface) {
                    graphics.destroy();
                }
                goal.destroy();
            },
        };
    }

    private createWall(
        scene: Phaser.Scene,
        object: TiledObject,
        bodies: MatterJS.BodyType[],
        wallGraphics: Phaser.GameObjects.Graphics[],
        bumperFlashes: Map<MatterJS.BodyType, Phaser.GameObjects.Graphics>,
        groups: Map<string, { points: Point[]; object: TiledObject }[]>,
    ) {
        let shape: { points: Point[]; body: MatterJS.BodyType } | undefined;

        if (object.polygon && object.polygon.length >= 3) {
            shape = this.createPolygonWall(scene, object);
        } else if (object.ellipse) {
            shape = this.createEllipseWall(scene, object);
        } else if (object.width !== undefined && object.height !== undefined) {
            shape = this.createRectangleWall(scene, object);
        }

        if (!shape) {
            console.warn(`Wall "${object.name}" has invalid geometry`);
            return;
        }

        bodies.push(shape.body);

        // Hidden walls only need their body
        if (object.visible === false) {
            return;
        }

        // Pieces of a longer wall are drawn together once all are loaded
        const group = getStringProperty(object, "group");
        if (group) {
            const pieces = groups.get(group) ?? [];
            pieces.push({ points: shape.points, object });
            groups.set(group, pieces);
            return;
        }

        const art = drawWall(
            scene,
            shape.points,
            getWallColor(object),
            getMaterial(object.properties),
        );

        wallGraphics.push(art.shadow, art.body);

        if (art.flash) {
            wallGraphics.push(art.flash);
            bumperFlashes.set(shape.body, art.flash);
        }
    }

    private createEllipseWall(scene: Phaser.Scene, object: TiledObject) {
        const width = object.width ?? 0;
        const height = object.height ?? 0;

        const x = (object.x ?? 0) + width / 2;
        const y = (object.y ?? 0) + height / 2;

        // A polygon that follows the ellipse, so the ball bounces where the
        // wall is drawn (a circle only fits if width === height)
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

        // Drawn smoother than the collision shape
        const outline = Array.from({ length: 48 }, (_, i) => {
            const angle = (i / 48) * Math.PI * 2;
            return {
                x: x + (Math.cos(angle) * width) / 2,
                y: y + (Math.sin(angle) * height) / 2,
            };
        });

        return { points: outline, body };
    }

    private createRectangleWall(scene: Phaser.Scene, object: TiledObject) {
        const left = object.x ?? 0;
        const top = object.y ?? 0;
        const width = object.width ?? 0;
        const height = object.height ?? 0;

        const body = scene.matter.add.rectangle(
            left + width / 2,
            top + height / 2,
            width,
            height,
            {
                isStatic: true,
            },
        );

        const points = [
            { x: left, y: top },
            { x: left + width, y: top },
            { x: left + width, y: top + height },
            { x: left, y: top + height },
        ];

        return { points, body };
    }

    private createPolygonWall(scene: Phaser.Scene, object: TiledObject) {
        const originX = object.x ?? 0;
        const originY = object.y ?? 0;

        const points = object.polygon!.map((point) => ({
            x: point.x,
            y: point.y,
        }));

        const centroid = this.getPolygonCentroid(points);

        const localPoints = points.map((point) => ({
            x: point.x - centroid.x,
            y: point.y - centroid.y,
        }));

        const body = scene.matter.add.fromVertices(
            originX + centroid.x,
            originY + centroid.y,
            localPoints,
            {
                isStatic: true,
            },
        );

        return {
            points: points.map((point) => ({
                x: originX + point.x,
                y: originY + point.y,
            })),
            body,
        };
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
