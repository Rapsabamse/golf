import * as Phaser from "phaser";
import { COLORS, CSS, TYPE, addText, drawPennant } from "./theme";

const HEIGHT = 56;
const LIP = 5;
const RADIUS = 18;
const PADDING_X = 30;
const FLAG_SPACE = 26;

/**
 * The main action button: a raised fairway-green pad with the hole flag.
 * It sinks onto its lip when pressed.
 */
export class Button extends Phaser.GameObjects.Container {
    private readonly face: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;
    private readonly hitZone: Phaser.GameObjects.Zone;

    private buttonWidth = 0;
    private hovered = false;
    private pressed = false;
    private enabled = true;
    private onClick?: () => void;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        text: string,
        private readonly minWidth = 220,
    ) {
        super(scene, x, y);

        this.face = scene.add.graphics();
        this.label = addText(scene, 0, 0, text, {
            size: TYPE.label,
            bold: true,
            color: CSS.ink,
        }).setOrigin(0, 0.5);

        this.hitZone = scene.add
            .zone(0, 0, 10, 10)
            .setInteractive({ useHandCursor: true });

        this.add([this.face, this.label, this.hitZone]);

        this.hitZone.on("pointerover", () => {
            this.hovered = true;
            this.redraw();
        });

        this.hitZone.on("pointerout", () => {
            this.hovered = false;
            this.pressed = false;
            this.redraw();
        });

        this.hitZone.on("pointerdown", () => {
            if (!this.enabled) {
                return;
            }

            this.pressed = true;
            this.redraw();
        });

        this.hitZone.on("pointerup", () => {
            const wasPressed = this.pressed;
            this.pressed = false;
            this.redraw();

            if (wasPressed && this.enabled) {
                this.onClick?.();
            }
        });

        this.layout();
        scene.add.existing(this);
    }

    setText(text: string) {
        this.label.setText(text);
        this.layout();
        return this;
    }

    setOnClick(callback: () => void) {
        this.onClick = callback;
        return this;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        this.redraw();
        return this;
    }

    isEnabled() {
        return this.enabled;
    }

    /** Run the click action from the keyboard, with the same pressed look. */
    trigger() {
        if (!this.visible || !this.enabled) {
            return;
        }

        this.pressed = true;
        this.redraw();

        this.scene.time.delayedCall(90, () => {
            this.pressed = false;
            this.redraw();
            this.onClick?.();
        });
    }

    private layout() {
        this.buttonWidth = Math.max(
            this.minWidth,
            Math.ceil(this.label.width) + PADDING_X * 2 + FLAG_SPACE,
        );

        this.hitZone.setSize(this.buttonWidth, HEIGHT + LIP);
        this.hitZone.input?.hitArea.setTo(0, 0, this.buttonWidth, HEIGHT + LIP);

        this.setSize(this.buttonWidth, HEIGHT + LIP);
        this.redraw();
    }

    private redraw() {
        const width = this.buttonWidth;
        const left = -width / 2;
        const top = -(HEIGHT + LIP) / 2;
        const sink = this.pressed ? LIP - 1 : 0;

        const faceColor = !this.enabled
            ? COLORS.disabled
            : this.hovered
              ? COLORS.fairwayLight
              : COLORS.fairway;

        this.face.clear();

        // Lip
        this.face.fillStyle(this.enabled ? COLORS.fairwayLip : 0x343c55, 1);
        this.face.fillRoundedRect(left, top + LIP, width, HEIGHT, RADIUS);

        // Face
        this.face.fillStyle(faceColor, 1);
        this.face.fillRoundedRect(left, top + sink, width, HEIGHT, RADIUS);

        // Flag + label, centred together
        const contentWidth = FLAG_SPACE + this.label.width;
        const contentLeft = -contentWidth / 2;
        const centerY = top + sink + HEIGHT / 2;

        drawPennant(
            this.face,
            contentLeft + 3,
            centerY + 11,
            22,
            COLORS.ink,
            COLORS.ink,
        );

        this.label.setPosition(contentLeft + FLAG_SPACE, centerY + 1);
        this.label.setColor(this.enabled ? CSS.ink : CSS.muted);
    }
}
