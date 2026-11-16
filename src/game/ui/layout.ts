import * as Phaser from "phaser";

/**
 * The game was designed at 1280×720. Everything scales from that size so
 * every window shows the same proportions: a 1920×1080 screen gets a
 * 1.5× interface and a 1.5× view of the course.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** The interface never gets smaller or bigger than this, however odd the window. */
const MIN_UI_SCALE = 0.6;
const MAX_UI_SCALE = 2.5;

/** How much bigger (or smaller) this window is than the design size. */
export function getViewScale(scene: Phaser.Scene) {
    return Math.min(
        scene.scale.width / DESIGN_WIDTH,
        scene.scale.height / DESIGN_HEIGHT,
    );
}

export function getUiScale(scene: Phaser.Scene) {
    return Phaser.Math.Clamp(getViewScale(scene), MIN_UI_SCALE, MAX_UI_SCALE);
}

/** Camera zoom for the course: the zoom players chose, adjusted for the window size. */
export function getWorldZoom(scene: Phaser.Scene, relativeZoom: number) {
    return relativeZoom * getViewScale(scene);
}

/**
 * Scale a menu or interface scene by the UI scale, anchored at the top-left,
 * and return the size of the screen in interface units. Lay things out in
 * those units: 0..width across, 0..height down.
 */
export function applyUiScale(scene: Phaser.Scene) {
    const scale = getUiScale(scene);
    const camera = scene.cameras.main;

    camera.setSize(scene.scale.width, scene.scale.height);
    camera.setOrigin(0, 0);
    camera.setZoom(scale);
    camera.setScroll(0, 0);

    return {
        width: scene.scale.width / scale,
        height: scene.scale.height / scale,
        scale,
    };
}

/** Run `callback` whenever the window changes size, until the scene shuts down. */
export function onResize(scene: Phaser.Scene, callback: () => void) {
    const handler = () => callback();

    scene.scale.on(Phaser.Scale.Events.RESIZE, handler);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
    });
}
