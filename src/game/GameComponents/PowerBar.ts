import * as Phaser from "phaser";
import { COLORS, CSS, TYPE, addText } from "../ui/theme";

const BAR_WIDTH = 340;
const BAR_HEIGHT = 16;
const TRACK_PADDING = 4;
const NUMBER_GAP = 14;

/** Fill colour runs from fairway green to gold at full power. */
const LOW_COLOR = Phaser.Display.Color.ValueToColor(COLORS.fairway);
const HIGH_COLOR = Phaser.Display.Color.ValueToColor(0xffd84d);

/**
 * Shot power at the bottom of the screen, above the main button. Shows
 * while you aim and keeps showing the power you picked until the shot is
 * played.
 */
export class PowerBar {
    private readonly container: Phaser.GameObjects.Container;
    private readonly track: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly number: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, centerX: number, centerY: number) {
        this.track = scene.add.graphics();
        this.fill = scene.add.graphics();

        this.number = addText(scene, 0, 0, "", {
            size: TYPE.label,
            bold: true,
        }).setOrigin(0, 0.5);

        // The bar is centred on its own, lined up with the button below;
        // the number hangs off its right end
        this.container = scene.add
            .container(centerX - BAR_WIDTH / 2, centerY, [
                this.track,
                this.fill,
                this.number,
            ])
            .setVisible(false);

        this.drawTrack();
        this.number.setPosition(BAR_WIDTH + NUMBER_GAP, 1);
    }

    /** Move the bar so it is centred on (centerX, centerY). */
    setCenter(centerX: number, centerY: number) {
        this.container.setPosition(centerX - BAR_WIDTH / 2, centerY);
    }

    /** `charge` is 0..1 of full power; undefined hides the bar. */
    setCharge(charge: number | undefined) {
        if (charge === undefined) {
            this.container.setVisible(false);
            return;
        }

        const isMax = charge >= 0.999;
        const innerWidth = BAR_WIDTH - TRACK_PADDING * 2;
        const width = Math.max(BAR_HEIGHT, innerWidth * charge);

        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
            LOW_COLOR,
            HIGH_COLOR,
            100,
            Math.round(charge * 100),
        );

        this.fill.clear();
        this.fill.fillStyle(
            Phaser.Display.Color.GetColor(color.r, color.g, color.b),
            1,
        );
        this.fill.fillRoundedRect(
            TRACK_PADDING,
            -BAR_HEIGHT / 2,
            width,
            BAR_HEIGHT,
            BAR_HEIGHT / 2,
        );

        this.number
            .setText(isMax ? "Max" : `${Math.round(charge * 100)}%`)
            .setColor(isMax ? "#ffd84d" : CSS.text);

        this.container.setVisible(true);
    }

    private drawTrack() {
        const height = BAR_HEIGHT + TRACK_PADDING * 2;
        const top = -height / 2;

        this.track.fillStyle(COLORS.panel, 0.92);
        this.track.fillRoundedRect(0, top, BAR_WIDTH, height, height / 2);
        this.track.lineStyle(1.5, COLORS.panelEdge, 1);
        this.track.strokeRoundedRect(0, top, BAR_WIDTH, height, height / 2);

        // Quarter marks so you can repeat a power you liked
        this.track.lineStyle(2, COLORS.muted, 0.35);
        for (const fraction of [0.25, 0.5, 0.75]) {
            const x = TRACK_PADDING + (BAR_WIDTH - TRACK_PADDING * 2) * fraction;
            this.track.lineBetween(x, top + 5, x, top + height - 5);
        }
    }
}
