import * as Phaser from "phaser";
import { DEPTH } from "./CourseArt";
import { MusicPulse } from "../GameComponents/Music";
import { getTrackTheme } from "../ui/trackThemes";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

/** Seconds for the lighting to change with the track. */
const FADE = 2.5;
/** How strong each light is once faded in. */
const RIM_ALPHA = 0.4;
const GLOW_ALPHA = 0.45;
const MOOD_ALPHA = 0.4;

/**
 * Lights the course to match the room it stands in: a soft tint of the
 * track's colour over the turf, neon trim along the tops of the walls and
 * a glow in the cup. Steady (nothing flashes), fading when the track
 * changes, and gone when no music plays.
 */
export class CourseLights {
    private readonly mood: Phaser.GameObjects.Graphics;
    private readonly rim: Phaser.GameObjects.Graphics;
    private readonly glow: Phaser.GameObjects.Image;
    /** Which track's colours are drawn. */
    private drawnFor?: string;
    private strength = 0;

    constructor(
        scene: Phaser.Scene,
        /** The wall edges to trim (edges between pieces of one wall left out). */
        private readonly edges: [Point, Point][],
        cup: Point,
        /** The turf, as rectangles. */
        private readonly turf: Rect[],
    ) {
        // Over the course art, under the moving pieces, the shot lines and the balls
        this.mood = scene.add
            .graphics()
            .setDepth(DEPTH.wall + 0.3)
            .setBlendMode(Phaser.BlendModes.MULTIPLY)
            .setAlpha(0);

        this.rim = scene.add
            .graphics()
            .setDepth(DEPTH.wall + 0.5)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);

        this.glow = scene.add
            .image(cup.x, cup.y, glowTexture(scene))
            .setDepth(DEPTH.wall + 0.4)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.8)
            .setAlpha(0);
    }

    update(pulse: MusicPulse, delta: number) {
        const theme = getTrackTheme(pulse.track);

        if (theme && pulse.track !== this.drawnFor) {
            this.draw(theme.mood, theme.rim);
            this.glow.setTint(theme.glow);
            this.drawnFor = pulse.track;
        }

        // Fade in and out with the track, slowly
        const step = delta / 1000 / FADE;
        this.strength = theme
            ? Math.min(1, this.strength + step)
            : Math.max(0, this.strength - step);

        this.mood.setAlpha(MOOD_ALPHA * this.strength);
        this.rim.setAlpha(RIM_ALPHA * this.strength);
        this.glow.setAlpha(GLOW_ALPHA * this.strength);
    }

    destroy() {
        this.mood.destroy();
        this.rim.destroy();
        this.glow.destroy();
    }

    private draw(mood: number, rim: number) {
        this.mood.clear();
        this.mood.fillStyle(mood, 1);
        for (const rect of this.turf) {
            this.mood.fillRect(rect.x, rect.y, rect.width, rect.height);
        }

        this.rim.clear();
        // A wide faint stroke for the glow, then a bright thin one
        for (const [width, alpha] of [
            [10, 0.25],
            [3, 1],
        ]) {
            this.rim.lineStyle(width, rim, alpha);
            for (const [a, b] of this.edges) {
                this.rim.lineBetween(a.x, a.y, b.x, b.y);
            }
        }
    }
}

/** A soft round glow, white in the middle. */
function glowTexture(scene: Phaser.Scene) {
    const key = "course-glow";
    if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, 128, 128);
        if (texture) {
            const context = texture.getContext();
            const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
            glow.addColorStop(0, "rgba(255, 255, 255, 1)");
            glow.addColorStop(0.35, "rgba(255, 255, 255, 0.35)");
            glow.addColorStop(1, "rgba(255, 255, 255, 0)");
            context.fillStyle = glow;
            context.fillRect(0, 0, 128, 128);
            texture.refresh();
        }
    }
    return key;
}
