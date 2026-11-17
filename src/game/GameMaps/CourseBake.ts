import * as Phaser from "phaser";

/** Room around the map for shadows that fall past its edge. */
const MARGIN = 64;
/** Largest texture side we'll use, even if the graphics card allows more. */
const MAX_TEXTURE_SIDE = 4096;
/** Redraw sharper once the camera is this much closer than the last drawing. */
const SHARPEN_AT = 1.15;
/** Redraw smaller (to free memory) once the camera is this much further away. */
const SHRINK_AT = 0.5;
/** Wait for zooming to settle before redrawing. */
const SETTLE_MS = 250;

let nextKey = 0;

/**
 * Draws the parts of a course that never change (grass, stripes, shadows,
 * walls, tee, cup) into one texture and shows that instead.
 *
 * Phaser rebuilds every vector shape on the CPU each frame, and a course is
 * thousands of shapes, so drawing them once keeps the game light. The
 * texture is redrawn at a higher resolution when the camera zooms in, so it
 * stays sharp.
 */
export class CourseBake {
    private readonly key = `course-bake-${nextKey++}`;
    private readonly bounds: Phaser.Geom.Rectangle;
    private texture?: Phaser.Textures.DynamicTexture;
    private image?: Phaser.GameObjects.Image;
    /** Texture pixels per world pixel in the current drawing. */
    private scale = 0;
    private lastZoom = 0;
    private zoomChangedAt = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        /** The objects to draw, in any order (they are drawn by depth). */
        objects: Phaser.GameObjects.GameObject[],
        mapBounds: Phaser.Geom.Rectangle,
        private readonly depth: number,
    ) {
        this.bounds = new Phaser.Geom.Rectangle(
            mapBounds.x - MARGIN,
            mapBounds.y - MARGIN,
            mapBounds.width + MARGIN * 2,
            mapBounds.height + MARGIN * 2,
        );

        // Same order the scene would draw them in
        const list = scene.children.list;
        this.objects = [...objects].sort(
            (a, b) =>
                (a as unknown as Phaser.GameObjects.Components.Depth).depth -
                    (b as unknown as Phaser.GameObjects.Components.Depth).depth ||
                list.indexOf(a) - list.indexOf(b),
        );

        this.draw(this.wantedScale());
    }

    private readonly objects: Phaser.GameObjects.GameObject[];

    /** Call every frame: redraws sharper after the camera zooms in. */
    update() {
        const zoom = this.scene.cameras.main.zoom;
        const now = this.scene.time.now;

        if (zoom !== this.lastZoom) {
            this.lastZoom = zoom;
            this.zoomChangedAt = now;
            return;
        }

        if (now - this.zoomChangedAt < SETTLE_MS) {
            return;
        }

        const wanted = this.wantedScale();

        if (wanted > this.scale * SHARPEN_AT || wanted < this.scale * SHRINK_AT) {
            this.draw(wanted);
        }
    }

    destroy() {
        this.image?.destroy();
        this.texture?.destroy();
    }

    /** One texture pixel per screen pixel, as far as the texture size allows. */
    private wantedScale() {
        const renderer = this.scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        const maxSide = Math.min(
            MAX_TEXTURE_SIDE,
            renderer.getMaxTextureSize?.() ?? MAX_TEXTURE_SIDE,
        );
        const fit = Math.min(maxSide / this.bounds.width, maxSide / this.bounds.height);

        // Round so small zoom changes don't cause redraws
        const zoom = Math.ceil(this.scene.cameras.main.zoom * 8) / 8;

        return Math.min(zoom, fit);
    }

    private draw(scale: number) {
        const width = Math.ceil(this.bounds.width * scale);
        const height = Math.ceil(this.bounds.height * scale);

        if (!this.texture) {
            this.texture = this.scene.textures.addDynamicTexture(this.key, width, height)!;
        } else {
            this.texture.setSize(width, height);
        }

        const texture = this.texture;
        const camera = texture.camera;
        camera.setSize(width, height);
        camera.setOrigin(0, 0);
        camera.setZoom(scale);
        camera.setScroll(this.bounds.x, this.bounds.y);

        texture.clear();

        // Draw the whole tile layer, not just what the scene camera sees
        const layers = this.objects.filter(
            (object): object is Phaser.Tilemaps.TilemapLayer =>
                object instanceof Phaser.Tilemaps.TilemapLayer,
        );
        const skipCull = layers.map((layer) => layer.skipCull);
        layers.forEach((layer) => (layer.skipCull = true));

        for (const object of this.objects) {
            (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
            texture.capture(object, { transform: "local" });
        }

        // Drawing happens here, so everything must still be visible
        texture.render();

        layers.forEach((layer, i) => (layer.skipCull = skipCull[i]));

        // The originals stay (they own the shapes) but are no longer drawn
        for (const object of this.objects) {
            (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
        }

        if (!this.image) {
            this.image = this.scene.add
                .image(this.bounds.x, this.bounds.y, this.key)
                .setOrigin(0, 0)
                .setDepth(this.depth);
        } else {
            // Picks up the new size
            this.image.setTexture(this.key);
        }

        this.image.setScale(1 / scale);
        this.scale = scale;
    }
}
