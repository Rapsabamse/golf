import * as Phaser from "phaser";

export function createCourseWalls(scene: Phaser.Scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;
    const thickness = 50;

    const wallOptions = {
        isStatic: true,
        restitution: 0.8,
    };

    scene.matter.add.rectangle(
        width / 2,
        -thickness / 2,
        width,
        thickness,
        wallOptions,
    );

    scene.matter.add.rectangle(
        width / 2,
        height + thickness / 2,
        width,
        thickness,
        wallOptions,
    );

    scene.matter.add.rectangle(
        -thickness / 2,
        height / 2,
        thickness,
        height,
        wallOptions,
    );

    scene.matter.add.rectangle(
        width + thickness / 2,
        height / 2,
        thickness,
        height,
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
    scene.add.rectangle(x, y, width, height, color);

    scene.matter.add.rectangle(x, y, width, height, {
        isStatic: true,
        restitution: 0.8,
    });
}
