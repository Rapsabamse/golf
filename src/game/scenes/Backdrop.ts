import * as Phaser from "phaser";
import { Scene } from "phaser";
import { onResize } from "../ui/layout";

/*
 * The sky behind everything: a navy-to-deep-space gradient with faint
 * nebula haze, two layers of stars that drift a little as the course camera
 * moves, and a few stars that twinkle. It runs as its own scene underneath
 * the menu and the game, so the camera zoom never changes it.
 *
 * The gradient and both star layers are painted together into one
 * screen-sized picture, repainted only when the stars have actually moved.
 * Drawing three full-screen layers every frame made the sky the most
 * expensive thing in the game.
 */

const GRADIENT = "backdrop-gradient";
const FAR_STARS = "backdrop-stars-far";
const NEAR_STARS = "backdrop-stars-near";
const STAR_TILE = 1024;

/** How much each star layer moves with the course camera (0 = fixed). */
const FAR_PARALLAX = 0.04;
const NEAR_PARALLAX = 0.1;
/** Slow drift when no course is on screen (menu, loading). */
const DRIFT_PER_SECOND = 4;
/** Repaint the sky once the near stars have moved this far (pixels). */
const REPAINT_STEP = 0.5;

const TWINKLES = 14;

/** Same seed for everyone, so every player sees the same sky. */
function seededRandom(seed: number) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
}

/** A star tile repeated to cover the screen, scrolled for parallax. Painted into the sky, never drawn itself. */
class StarLayer {
    readonly images: Phaser.GameObjects.Image[] = [];
    private columns = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly key: string,
    ) {}

    /** Enough tiles to cover the screen however it's scrolled. */
    setSize(width: number, height: number) {
        this.columns = Math.ceil(width / STAR_TILE) + 1;
        const count = this.columns * (Math.ceil(height / STAR_TILE) + 1);

        while (this.images.length < count) {
            this.images.push(new Phaser.GameObjects.Image(this.scene, 0, 0, this.key).setOrigin(0));
        }
        while (this.images.length > count) {
            this.images.pop()!.destroy();
        }
    }

    /** Show the tile from (x, y) at the top-left of the screen, repeating. */
    scrollTo(x: number, y: number) {
        const left = -(((x % STAR_TILE) + STAR_TILE) % STAR_TILE);
        const top = -(((y % STAR_TILE) + STAR_TILE) % STAR_TILE);

        this.images.forEach((image, i) => {
            image.setPosition(
                left + (i % this.columns) * STAR_TILE,
                top + Math.floor(i / this.columns) * STAR_TILE,
            );
        });
    }
}

export class Backdrop extends Scene {
    /** The gradient and both star layers, painted together. */
    private sky!: Phaser.GameObjects.RenderTexture;
    private gradient!: Phaser.GameObjects.Image;
    private farStars!: StarLayer;
    private nearStars!: StarLayer;
    private twinkles: Phaser.GameObjects.Arc[] = [];
    private drift = 0;
    /** Where the near stars were when the sky was last painted. */
    private paintedAt?: { x: number; y: number };

    constructor() {
        super("Backdrop");
    }

    create() {
        this.createTextures();

        this.sky = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setOrigin(0);
        this.gradient = new Phaser.GameObjects.Image(this, 0, 0, GRADIENT).setOrigin(0);
        this.farStars = new StarLayer(this, FAR_STARS);
        this.nearStars = new StarLayer(this, NEAR_STARS);

        this.createTwinkles();
        this.layout();
        onResize(this, () => this.layout());
    }

    update(_time: number, delta: number) {
        // Follow the course camera a little when a game is running
        const game = this.scene.get("Game");
        const camera = game?.sys.isActive() ? game.cameras.main : undefined;

        let x: number;
        let y: number;

        if (camera) {
            x = camera.scrollX;
            y = camera.scrollY;
        } else {
            this.drift += (DRIFT_PER_SECOND * delta) / 1000;
            x = this.drift * 10;
            y = this.drift * 4;
        }

        this.paint(x, y);
    }

    /** Repaint the sky if the stars have moved enough to notice. */
    private paint(x: number, y: number) {
        const nearX = x * NEAR_PARALLAX;
        const nearY = y * NEAR_PARALLAX;
        const last = this.paintedAt;

        if (
            last &&
            Math.abs(nearX - last.x) < REPAINT_STEP &&
            Math.abs(nearY - last.y) < REPAINT_STEP
        ) {
            return;
        }
        this.paintedAt = { x: nearX, y: nearY };

        this.farStars.scrollTo(x * FAR_PARALLAX, y * FAR_PARALLAX);
        this.nearStars.scrollTo(nearX, nearY);

        this.sky
            .clear()
            .draw([this.gradient, ...this.farStars.images, ...this.nearStars.images])
            .render();
    }

    private layout() {
        const { width, height } = this.scale;

        this.cameras.main.setSize(width, height);
        this.sky.resize(width, height);
        this.gradient.setDisplaySize(width, height);
        this.farStars.setSize(width, height);
        this.nearStars.setSize(width, height);
        // Repaint at the new size on the next update
        this.paintedAt = undefined;

        // Keep the twinkling stars spread over the whole screen
        const random = seededRandom(99);
        for (const star of this.twinkles) {
            star.setPosition(random() * width, random() * height);
        }
    }

    private createTextures() {
        if (!this.textures.exists(GRADIENT)) {
            this.createGradientTexture();
        }
        if (!this.textures.exists(FAR_STARS)) {
            this.createStarTexture(FAR_STARS, 700, 0.6, 1.1, 0.25, 0.65, 11);
        }
        if (!this.textures.exists(NEAR_STARS)) {
            this.createStarTexture(NEAR_STARS, 140, 0.9, 1.8, 0.5, 0.95, 23);
        }
    }

    /** Navy in the middle fading to deep space at the edges, with faint haze. */
    private createGradientTexture() {
        const size = 512;
        const texture = this.textures.createCanvas(GRADIENT, size, size);
        if (!texture) {
            return;
        }

        const context = texture.getContext();

        const sky = context.createRadialGradient(
            size * 0.5, size * 0.42, size * 0.05,
            size * 0.5, size * 0.5, size * 0.75,
        );
        sky.addColorStop(0, "#1a2450");
        sky.addColorStop(0.55, "#0f1736");
        sky.addColorStop(1, "#060917");
        context.fillStyle = sky;
        context.fillRect(0, 0, size, size);

        // Nebula haze: soft violet and teal clouds, barely there
        const haze: [number, number, number, string][] = [
            [0.18, 0.25, 0.32, "rgba(98, 70, 170, 0.20)"],
            [0.82, 0.72, 0.36, "rgba(40, 120, 150, 0.16)"],
            [0.65, 0.15, 0.22, "rgba(120, 80, 170, 0.10)"],
            [0.3, 0.85, 0.25, "rgba(50, 90, 160, 0.12)"],
        ];

        for (const [x, y, radius, color] of haze) {
            const cloud = context.createRadialGradient(
                x * size, y * size, 0,
                x * size, y * size, radius * size,
            );
            cloud.addColorStop(0, color);
            cloud.addColorStop(1, "rgba(0, 0, 0, 0)");
            context.fillStyle = cloud;
            context.fillRect(0, 0, size, size);
        }

        texture.refresh();
    }

    /** A tile of stars that repeats seamlessly in both directions. */
    private createStarTexture(
        key: string,
        count: number,
        minRadius: number,
        maxRadius: number,
        minAlpha: number,
        maxAlpha: number,
        seed: number,
    ) {
        const texture = this.textures.createCanvas(key, STAR_TILE, STAR_TILE);
        if (!texture) {
            return;
        }

        const context = texture.getContext();
        const random = seededRandom(seed);
        const tints = ["255, 255, 255", "200, 215, 255", "255, 240, 215"];

        for (let i = 0; i < count; i++) {
            const x = random() * STAR_TILE;
            const y = random() * STAR_TILE;
            // Most stars are tiny; a few are larger
            const radius = minRadius + Math.pow(random(), 3) * (maxRadius - minRadius);
            const alpha = minAlpha + random() * (maxAlpha - minAlpha);
            const tint = tints[Math.floor(random() * tints.length)];

            // Draw near the edges on the opposite side too, so the tile wraps
            for (const dx of [-STAR_TILE, 0, STAR_TILE]) {
                for (const dy of [-STAR_TILE, 0, STAR_TILE]) {
                    const px = x + dx;
                    const py = y + dy;
                    if (px < -8 || py < -8 || px > STAR_TILE + 8 || py > STAR_TILE + 8) {
                        continue;
                    }

                    // Soft glow, then the star itself
                    if (radius > 1.2) {
                        const glow = context.createRadialGradient(px, py, 0, px, py, radius * 4);
                        glow.addColorStop(0, `rgba(${tint}, ${alpha * 0.35})`);
                        glow.addColorStop(1, `rgba(${tint}, 0)`);
                        context.fillStyle = glow;
                        context.fillRect(px - radius * 4, py - radius * 4, radius * 8, radius * 8);
                    }

                    context.fillStyle = `rgba(${tint}, ${alpha})`;
                    context.beginPath();
                    context.arc(px, py, radius, 0, Math.PI * 2);
                    context.fill();
                }
            }
        }

        texture.refresh();
    }

    /** A handful of brighter stars that slowly fade in and out. */
    private createTwinkles() {
        const random = seededRandom(7);

        for (let i = 0; i < TWINKLES; i++) {
            const star = this.add.circle(0, 0, 1.2 + random() * 0.8, 0xffffff, 1);
            this.twinkles.push(star);

            this.tweens.add({
                targets: star,
                alpha: { from: 0.15, to: 0.9 },
                duration: 1600 + random() * 2400,
                delay: random() * 3000,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            });
        }
    }
}
