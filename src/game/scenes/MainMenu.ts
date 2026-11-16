import * as Phaser from "phaser";
import { Scene } from "phaser";

import { EventBus } from "../EventBus";
import { getRandomName } from "../GameHelpers/MenuHelpers";
import { Button } from "../ui/Button";
import { COLORS, CSS, FONTS, TYPE, addText, drawPennant } from "../ui/theme";

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

    constructor() {
        super("MainMenu");
    }

    create() {
        const { width, height } = this.scale;
        const centerX = width / 2;

        this.add.tileSprite(centerX, height / 2, width, height, "space");

        // Title
        addText(this, centerX, 150, "GOLF - golf", {
            size: TYPE.display,
            bold: true,
        })
            .setOrigin(0.5)
            .setLetterSpacing(2);

        addText(
            this,
            centerX,
            228,
            "Mini golf where everyone putts at once.",
            { size: TYPE.label, color: CSS.muted },
        ).setOrigin(0.5);

        // The putting green the name field sits on
        this.padTop = 300;
        this.drawPad(centerX - PAD_WIDTH / 2, this.padTop);

        addText(this, centerX, this.padTop + 34, "Your name", {
            size: TYPE.body,
            bold: true,
            color: CSS.ink,
        }).setOrigin(0.5, 0);

        this.joinButton = new Button(
            this,
            centerX,
            this.padTop + PAD_HEIGHT + PAD_LIP + 60,
            "Join game",
            INPUT_WIDTH,
        ).setOnClick(() => this.changeScene());

        this.createNameInput();

        EventBus.emit("current-scene-ready", this);
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

        this.positionNameInput();
        window.addEventListener("resize", this.positionNameInput);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
            this.removeNameInput(),
        );

        this.nameInput.focus();
    }

    private removeNameInput() {
        window.removeEventListener("resize", this.positionNameInput);
        this.nameInput?.remove();
    }

    /** Keep the HTML field over the pad, wherever the canvas sits on the page. */
    private positionNameInput = () => {
        const canvas = this.game.canvas;
        const bounds = canvas.getBoundingClientRect();
        const scale = bounds.width / this.scale.width;

        const centerX =
            bounds.left + window.scrollX + (this.scale.width / 2) * scale;
        const centerY =
            bounds.top + window.scrollY + (this.padTop + 108) * scale;

        Object.assign(this.nameInput.style, {
            left: `${centerX}px`,
            top: `${centerY}px`,
            width: `${INPUT_WIDTH * scale}px`,
            height: `${INPUT_HEIGHT * scale}px`,
            fontSize: `${22 * scale}px`,
        });
    };

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
