import * as Phaser from "phaser";

/** Zoom added over the course of the shot-of-the-hole replay. */
const REPLAY_PUSH = 0.08;
/** Letterbox bars, as a share of the screen height (each). */
const LETTERBOX = 0.09;

/**
 * The shot-of-the-hole replay plays like a film: letterbox bars slide in
 * and the camera slowly pushes in, then both ease back afterwards.
 *
 * The push-in is added just before each frame is drawn and taken off right
 * after, so whatever else the camera is doing (showing the whole course,
 * the mouse-wheel zoom) carries on underneath untouched.
 */
export class CinematicCamera {
    private push = 0;
    private pushing = false;
    /** Off when the player has cinematic mode turned off. */
    private enabled = true;
    private letterbox = 0;
    /** The zoom before the push-in this frame, to put back. */
    private baseZoom?: number;

    private readonly top: Phaser.GameObjects.Rectangle;
    private readonly bottom: Phaser.GameObjects.Rectangle;
    private width = 0;
    private height = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        hud: Phaser.Scene,
    ) {
        this.top = hud.add.rectangle(0, 0, 10, 10, 0x000000).setOrigin(0, 0).setDepth(15);
        this.bottom = hud.add.rectangle(0, 0, 10, 10, 0x000000).setOrigin(0, 1).setDepth(15);

        scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.apply, this);
        scene.events.on(Phaser.Scenes.Events.RENDER, this.restore, this);
        scene.events.on("replay-start", this.onReplayStart, this);
        scene.events.on("replay-end", this.onReplayEnd, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    /** Called on every resize with the screen size in interface units. */
    layout(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.drawBars();
    }

    /** Turn the replay's letterbox and push-in on or off. */
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    /** Call every frame. */
    update(delta: number) {
        const seconds = delta / 1000;

        // The push-in builds slowly during a replay and eases back after
        const target = this.pushing && this.enabled ? 1 : 0;
        this.push += (target - this.push) * Math.min(1, seconds * (this.pushing ? 0.35 : 2));
        this.letterbox += (target - this.letterbox) * Math.min(1, seconds * 4);
        this.drawBars();
    }

    destroy() {
        this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.apply, this);
        this.scene.events.off(Phaser.Scenes.Events.RENDER, this.restore, this);
        this.scene.events.off("replay-start", this.onReplayStart, this);
        this.scene.events.off("replay-end", this.onReplayEnd, this);
        this.top.destroy();
        this.bottom.destroy();
    }

    private onReplayStart() {
        this.pushing = true;
    }

    private onReplayEnd() {
        this.pushing = false;
    }

    private apply() {
        if (this.push < 0.001) {
            return;
        }
        const camera = this.scene.cameras.main;
        this.baseZoom = camera.zoom;
        camera.zoom = camera.zoom * (1 + REPLAY_PUSH * this.push);
    }

    private restore() {
        if (this.baseZoom === undefined) {
            return;
        }
        this.scene.cameras.main.zoom = this.baseZoom;
        this.baseZoom = undefined;
    }

    private drawBars() {
        const barHeight = this.height * LETTERBOX * this.letterbox;
        this.top.setSize(this.width, barHeight).setVisible(barHeight > 0.5);
        this.bottom.setSize(this.width, barHeight).setPosition(0, this.height).setVisible(barHeight > 0.5);
    }
}
