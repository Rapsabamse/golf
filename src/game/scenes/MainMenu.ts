import * as Phaser from "phaser";
import { Scene } from "phaser";

import { EventBus } from "../EventBus";
import { getRandomName } from "../GameHelpers/MenuHelpers";
import { Button } from "../ui/Button";
import { COLORS, CSS, FONTS, TYPE, addText, drawPennant } from "../ui/theme";
import { DESIGN_HEIGHT, applyUiScale, onResize } from "../ui/layout";

const PAD_WIDTH = 460;
const PAD_HEIGHT = 180;
const PAD_LIP = 8;
const PAD_RADIUS = 28;
const STRIPE_WIDTH = 34;

const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 52;

const TURF = 0x6fbf3a;
const TURF_STRIPE = 0x7dcb48;
const TURF_LIP = 0x4f8f27;

const STYLE_ID = "golf-menu-style";

export class MainMenu extends Scene {
    private nameInput!: HTMLInputElement;
    private joinButton!: Button;
    private padTop = 0;

    /** Title, green and button, laid out around x = 0 at the 1280×720 design height. */
    private menu!: Phaser.GameObjects.Container;
    private uiScale = 1;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.menu = this.add.container(0, 0);

        // Title
        const title = addText(this, 0, 150, "GOLF - golf", {
            size: TYPE.display,
            bold: true,
        })
            .setOrigin(0.5)
            .setLetterSpacing(2);

        const tagline = addText(
            this,
            0,
            228,
            "Mini golf where everyone putts at once.",
            { size: TYPE.label, color: CSS.muted },
        ).setOrigin(0.5);

        // The putting green the name field sits on
        this.padTop = 300;
        const pad = this.drawPad(-PAD_WIDTH / 2, this.padTop);

        const nameLabel = addText(this, 0, this.padTop + 34, "Your name", {
            size: TYPE.body,
            bold: true,
            color: CSS.ink,
        }).setOrigin(0.5, 0);

        this.joinButton = new Button(
            this,
            0,
            this.padTop + PAD_HEIGHT + PAD_LIP + 60,
            "Join game",
            INPUT_WIDTH,
        ).setOnClick(() => this.changeScene());

        this.menu.add([title, tagline, pad, nameLabel, this.joinButton]);

        this.createNameInput();

        this.layout();
        onResize(this, () => this.layout());

        EventBus.emit("current-scene-ready", this);
    }

    /** Keep the menu centred at any size (the sky is the Backdrop scene). */
    private layout() {
        const { width, height, scale } = applyUiScale(this);
        this.uiScale = scale;

        this.menu.setPosition(width / 2, (height - DESIGN_HEIGHT) / 2);

        this.positionNameInput();
    }

    changeScene() {
        const name = this.nameInput.value.trim() || this.nameInput.placeholder;

        this.removeNameInput();

        this.scene.start("Game", {
            playerName: name,
        });
    }

    /** Raised turf with mown stripes, and the hole with its flag in the corner. */
    private drawPad(left: number, top: number) {
        const pad = this.add.graphics();

        pad.fillStyle(TURF_LIP, 1);
        pad.fillRoundedRect(left, top + PAD_LIP, PAD_WIDTH, PAD_HEIGHT, PAD_RADIUS);

        pad.fillStyle(TURF, 1);
        pad.fillRoundedRect(left, top, PAD_WIDTH, PAD_HEIGHT, PAD_RADIUS);

        // Stripes stay clear of the rounded corners
        pad.fillStyle(TURF_STRIPE, 1);
        for (
            let x = left + PAD_RADIUS;
            x + STRIPE_WIDTH <= left + PAD_WIDTH - PAD_RADIUS;
            x += STRIPE_WIDTH * 2
        ) {
            pad.fillRect(x, top, STRIPE_WIDTH, PAD_HEIGHT);
        }

        const holeX = left + PAD_WIDTH - 48;
        const holeY = top + 70;

        pad.fillStyle(0x0b1408, 1);
        pad.fillEllipse(holeX, holeY, 26, 12);

        drawPennant(pad, holeX, holeY, 56, COLORS.panel, COLORS.text);

        return pad;
    }

    private createNameInput() {
        this.injectInputStyle();

        this.nameInput = document.createElement("input");
        this.nameInput.type = "text";
        this.nameInput.className = "golf-name-input";
        this.nameInput.placeholder = getRandomName();
        this.nameInput.maxLength = 16;
        this.nameInput.setAttribute("aria-label", "Your name");

        this.nameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.joinButton.trigger();
            }
        });

        document.body.appendChild(this.nameInput);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
            this.removeNameInput(),
        );

        this.nameInput.focus();
    }

    private removeNameInput() {
        this.nameInput?.remove();
    }

    /** Keep the HTML field over the green, wherever the canvas sits and however it is scaled. */
    private positionNameInput() {
        if (!this.nameInput) {
            return;
        }

        const bounds = this.game.canvas.getBoundingClientRect();
        // Interface units to CSS pixels
        const toCss = this.uiScale * (bounds.width / this.scale.width);

        const centerX =
            bounds.left + window.scrollX + this.menu.x * toCss;
        const centerY =
            bounds.top +
            window.scrollY +
            (this.menu.y + this.padTop + 108) * toCss;

        Object.assign(this.nameInput.style, {
            left: `${centerX}px`,
            top: `${centerY}px`,
            width: `${INPUT_WIDTH * toCss}px`,
            height: `${INPUT_HEIGHT * toCss}px`,
            fontSize: `${22 * toCss}px`,
            borderRadius: `${14 * toCss}px`,
        });
    }

    private injectInputStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .golf-name-input {
                position: absolute;
                transform: translate(-50%, -50%);
                box-sizing: border-box;
                padding: 0 16px;
                border: none;
                border-radius: 14px;
                background: #eef1fb;
                color: ${CSS.ink};
                font-family: ${FONTS.bold};
                text-align: center;
                box-shadow: 0 4px 0 #3f7a1f;
                outline: none;
            }
            .golf-name-input::placeholder {
                color: #6b7a63;
                font-family: ${FONTS.regular};
            }
            .golf-name-input:focus-visible {
                box-shadow: 0 4px 0 #3f7a1f, 0 0 0 3px #121a35;
            }
        `;

        document.head.appendChild(style);
    }
}
