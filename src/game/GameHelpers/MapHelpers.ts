import * as Phaser from "phaser";

export function createCourseWalls(
    scene: Phaser.Scene,
    mapWidth: number,
    mapHeight: number,
) {
    const thickness = 50;

    const wallOptions = {
        isStatic: true,
        restitution: 0.8,
    };

    // Top
    scene.matter.add.rectangle(
        0,
        -mapHeight / 2 - thickness / 2,
        mapWidth + thickness * 2,
        thickness,
        wallOptions,
    );

    // Bottom
    scene.matter.add.rectangle(
        0,
        mapHeight / 2 + thickness / 2,
        mapWidth + thickness * 2,
        thickness,
        wallOptions,
    );

    // Left
    scene.matter.add.rectangle(
        -mapWidth / 2 - thickness / 2,
        0,
        thickness,
        mapHeight + thickness * 2,
        wallOptions,
    );

    // Right
    scene.matter.add.rectangle(
        mapWidth / 2 + thickness / 2,
        0,
        thickness,
        mapHeight + thickness * 2,
        wallOptions,
    );
}

export function createRectangle(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
) {
    const visual = scene.add.rectangle(x, y, width, height, color);

    const body = scene.matter.add.rectangle(x, y, width, height, {
        isStatic: true,
        restitution: 1,
    });

    return {
        visual,
        body,
    };
}

export function createDiagonalWall(
    scene: Phaser.Scene,
    x: number,
    y: number,
    direction: "/" | "\\",
    tileSize: number,
) {
    const half = tileSize / 2;

    const vertices =
        direction === "/"
            ? [
                  { x: -half, y: half },
                  { x: half, y: half },
                  { x: half, y: -half },
              ]
            : [
                  { x: -half, y: -half },
                  { x: half, y: -half },
                  { x: -half, y: half },
              ];

    const body = scene.matter.add.fromVertices(x, y, vertices, {
        isStatic: true,
    });

    const visual = scene.add.polygon(
        x,
        y,
        vertices.flatMap((v) => [v.x, v.y]),
        0xffffff,
    );

    return { visual, body };
}
