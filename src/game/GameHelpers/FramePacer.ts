import * as Phaser from "phaser";

/*
 * Draws fewer frames when nothing on screen is changing, to save power.
 *
 * The game is capped at ACTIVE_FPS (see main.ts). When there's been no
 * mouse or keyboard input for a moment, no camera movement and no
 * animations playing (other than the never-ending ambient ones, like the
 * twinkling stars and the waving flag), it drops to IDLE_FPS. Any input or
 * movement brings it straight back.
 *
 * Physics runs on a fixed timestep, so shots play out exactly the same at
 * either rate.
 */

/** Frame rate while anything moves. Also the cap set in main.ts. */
export const ACTIVE_FPS = 60;
/** Frame rate when nothing but ambient animation is on screen. */
const IDLE_FPS = 30;
/** How long after the last input or movement to stay at the full rate (ms). */
const STAY_ACTIVE_MS = 1000;

/** Phaser keeps the limit's frame length private; it's read every frame. */
type LimitedLoop = Phaser.Core.TimeStep & { _limitRate: number };

export class FramePacer {
    private activeUntil = 0;
    private readonly cameraState = new WeakMap<Phaser.Cameras.Scene2D.Camera, string>();
    private idle = false;

    constructor(private readonly game: Phaser.Game) {
        const wake = () => this.keepActive();
        for (const type of ["pointermove", "pointerdown", "pointerup", "wheel", "keydown", "keyup"]) {
            window.addEventListener(type, wake, { passive: true });
        }
        window.addEventListener("resize", wake);

        game.events.on(Phaser.Core.Events.POST_STEP, this.check, this);
    }

    /** Stay at the full frame rate for a moment (call while something moves). */
    keepActive() {
        this.activeUntil = performance.now() + STAY_ACTIVE_MS;
        this.setIdle(false);
    }

    private check() {
        if (this.isAnythingMoving()) {
            this.keepActive();
            return;
        }
        this.setIdle(performance.now() > this.activeUntil);
    }

    private isAnythingMoving() {
        let moving = false;

        for (const scene of this.game.scene.getScenes(true)) {
            // A camera scrolling or zooming (following a ball, the player dragging)
            for (const camera of scene.cameras.cameras) {
                const state = `${camera.scrollX},${camera.scrollY},${camera.zoom}`;
                if (this.cameraState.get(camera) !== state) {
                    this.cameraState.set(camera, state);
                    moving = true;
                }
            }

            // A tween that ends (a ball sinking, a banner, the scoreboard),
            // but not the ambient ones that run forever
            scene.tweens.each((tween: Phaser.Tweens.Tween) => {
                if (!tween.isInfinite && tween.isPlaying()) {
                    moving = true;
                }
            });
        }

        return moving;
    }

    private setIdle(idle: boolean) {
        if (idle === this.idle) {
            return;
        }
        this.idle = idle;
        (this.game.loop as LimitedLoop)._limitRate = 1000 / (idle ? IDLE_FPS : ACTIVE_FPS);
    }
}

let pacer: FramePacer | undefined;

/** Start pacing the game's frames. */
export function startFramePacer(game: Phaser.Game) {
    pacer = new FramePacer(game);
    return pacer;
}

/** Stay at the full frame rate for a moment (call every frame while something moves). */
export function keepFramesActive() {
    pacer?.keepActive();
}
