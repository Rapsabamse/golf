import * as Phaser from "phaser";
import { Scene } from "phaser";

import { EventBus } from "../EventBus";
import {
    getRandomCatchphrase,
    getRandomName,
} from "../GameHelpers/MenuHelpers";
import { Button } from "../ui/Button";
import { Network } from "../Networking/Network";
import { RejoinStore, SavedSession } from "../Networking/RejoinStore";
import { COLORS, CSS, FONTS, TYPE, addText, drawPanel, drawPennant } from "../ui/theme";
import { DESIGN_HEIGHT, applyUiScale, onResize } from "../ui/layout";

const PAD_WIDTH = 460;
const PAD_HEIGHT = 290;
const PAD_LIP = 8;
const PAD_RADIUS = 28;
const STRIPE_WIDTH = 34;

const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 52;
const MAX_CATCHPHRASE_LENGTH = 24;
/** Adventor with its real letter heights, for the text fields (see the style). */
const FIELD_FONT = "Adventor Field";
const FIELD_FONT_BOLD = "Adventor Field Bold";

const TURF = 0x6fbf3a;
const TURF_STRIPE = 0x7dcb48;
const TURF_LIP = 0x4f8f27;

const STYLE_ID = "golf-menu-style";

/** Lobby codes are 4 letters. */
const CODE_LENGTH = 4;
/** Host and Join sit side by side under the green, as wide as it together. */
const ROW_BUTTON_WIDTH = 220;
const ROW_OFFSET = (PAD_WIDTH - ROW_BUTTON_WIDTH) / 2;

/** The popup offering to rejoin a game you were in. */
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 316;
const POPUP_PADDING = 36;

type MenuMode = "choose" | "join";

export class MainMenu extends Scene {
    private nameInput!: HTMLInputElement;
    /** Shown when your ball drops in; left empty, the greyed-out one is used. */
    private catchphraseInput!: HTMLInputElement;
    private codeInput!: HTMLInputElement;
    private hostButton!: Button;
    private joinButton!: Button;
    /** Join mode: joins the lobby with the typed code. */
    private confirmJoinButton!: Button;
    private backLink!: Phaser.GameObjects.Text;
    /**
     * Back after a refresh while still in a game: a popup over the menu
     * asking whether to rejoin it or leave it.
     */
    private popup!: Phaser.GameObjects.Container;
    private popupDim!: Phaser.GameObjects.Graphics;
    private popupBlocker!: Phaser.GameObjects.Zone;
    private popupCard!: Phaser.GameObjects.Container;
    private popupMessage!: Phaser.GameObjects.Text;
    private popupStatus!: Phaser.GameObjects.Text;
    private rejoinButton!: Button;
    private leaveLink!: Phaser.GameObjects.Text;
    /** Games this browser could rejoin, best first. */
    private savedGames: SavedSession[] = [];
    private status!: Phaser.GameObjects.Text;
    private padTop = 0;
    private rowY = 0;

    private mode: MenuMode = "choose";
    private busy = false;
    private network?: Network;

    /** Title, green and buttons, laid out around x = 0 at the 1280×720 design height. */
    private menu!: Phaser.GameObjects.Container;
    private uiScale = 1;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.mode = "choose";
        this.busy = false;
        this.network = undefined;
        this.menu = this.add.container(0, 0);

        // Title
        const title = addText(this, 0, 110, "GOLF - golf", {
            size: TYPE.display,
            bold: true,
        })
            .setOrigin(0.5)
            .setLetterSpacing(2);

        const tagline = addText(
            this,
            0,
            184,
            "Mini golf where everyone putts at once.",
            { size: TYPE.label, color: CSS.muted },
        ).setOrigin(0.5);

        // The putting green the fields sit on
        this.padTop = 232;
        const pad = this.drawPad(-PAD_WIDTH / 2, this.padTop);

        const nameLabel = addText(this, 0, this.padTop + 30, "Your name", {
            size: TYPE.body,
            bold: true,
            color: CSS.ink,
        }).setOrigin(0.5, 0);

        const catchphraseLabel = addText(
            this,
            0,
            this.padTop + 156,
            "Catchphrase",
            { size: TYPE.body, bold: true, color: CSS.ink },
        ).setOrigin(0.5, 0);

        this.rowY = this.padTop + PAD_HEIGHT + PAD_LIP + 60;

        // Host makes a new lobby; Join asks for a code first
        this.hostButton = new Button(
            this,
            -ROW_OFFSET,
            this.rowY,
            "Host game",
            ROW_BUTTON_WIDTH,
        ).setOnClick(() => this.hostGame());

        this.joinButton = new Button(
            this,
            ROW_OFFSET,
            this.rowY,
            "Join game",
            ROW_BUTTON_WIDTH,
        ).setOnClick(() => this.setMode("join"));

        // Join mode: the code field takes Host's place
        this.confirmJoinButton = new Button(
            this,
            ROW_OFFSET,
            this.rowY,
            "Join",
            ROW_BUTTON_WIDTH,
        )
            .setOnClick(() => this.joinGame())
            .setVisible(false);

        this.status = addText(this, 0, this.rowY + 66, "", {
            size: TYPE.body,
            color: CSS.muted,
        }).setOrigin(0.5);

        this.backLink = addText(this, 0, this.rowY + 108, "Back", {
            size: TYPE.body,
            bold: true,
            color: CSS.muted,
        })
            .setOrigin(0.5)
            .setPadding(12, 6, 12, 6)
            .setVisible(false)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => this.backLink.setColor(CSS.text))
            .on("pointerout", () => this.backLink.setColor(CSS.muted))
            .on("pointerup", () => this.setMode("choose"));

        this.menu.add([
            title,
            tagline,
            pad,
            nameLabel,
            catchphraseLabel,
            this.hostButton,
            this.joinButton,
            this.confirmJoinButton,
            this.status,
            this.backLink,
        ]);

        this.createPopup();
        this.createInputs();

        this.layout();
        onResize(this, () => this.layout());

        // Back after a refresh or a closed tab: offer to pick the game up again
        this.offerSavedGame();

        EventBus.emit("current-scene-ready", this);
    }

    /** Dimmed screen with a card: rejoin the game you were in, or leave it. */
    private createPopup() {
        // Over everything, and catching clicks so the menu below can't be used
        this.popupDim = this.add.graphics();
        this.popupBlocker = this.add.zone(0, 0, 1, 1).setOrigin(0).setInteractive();

        const card = this.add.graphics();
        drawPanel(card, -POPUP_WIDTH / 2, 0, POPUP_WIDTH, POPUP_HEIGHT, 20, 1);

        const title = addText(this, 0, POPUP_PADDING, "Game in progress", {
            size: TYPE.title,
            bold: true,
        }).setOrigin(0.5, 0);

        this.popupMessage = addText(this, 0, POPUP_PADDING + 56, "", {
            size: TYPE.body,
            color: CSS.muted,
            align: "center",
            wrap: POPUP_WIDTH - POPUP_PADDING * 2,
            lineSpacing: 4,
        }).setOrigin(0.5, 0);

        // Rejoining is the main choice, leaving the quiet one
        this.rejoinButton = new Button(this, 0, POPUP_HEIGHT - 112, "Rejoin game", 260)
            .setOnClick(() => this.rejoinSavedGame());

        this.leaveLink = addText(this, 0, POPUP_HEIGHT - 44, "Leave game", {
            size: TYPE.body,
            bold: true,
            color: CSS.muted,
        })
            .setOrigin(0.5)
            .setPadding(12, 6, 12, 6)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => this.leaveLink.setColor(CSS.text))
            .on("pointerout", () => this.leaveLink.setColor(CSS.muted))
            .on("pointerup", () => this.leaveSavedGame());

        // Shown instead of the choices while rejoining or leaving
        this.popupStatus = addText(this, 0, POPUP_HEIGHT - 80, "", {
            size: TYPE.body,
            color: CSS.muted,
        })
            .setOrigin(0.5)
            .setVisible(false);

        this.popupCard = this.add.container(0, 0, [
            card,
            title,
            this.popupMessage,
            this.rejoinButton,
            this.leaveLink,
            this.popupStatus,
        ]);

        this.popup = this.add
            .container(0, 0, [this.popupDim, this.popupBlocker, this.popupCard])
            .setVisible(false);

        // Enter rejoins while the popup is up (the text fields are hidden then)
        this.input.keyboard?.on("keydown-ENTER", () => {
            if (this.popup.visible) {
                this.rejoinButton.trigger();
            }
        });
    }

    /** Still in a game (after a refresh or a closed tab): ask to rejoin it or leave it. */
    private offerSavedGame() {
        this.savedGames = RejoinStore.candidates();

        if (this.savedGames.length === 0) {
            this.showPopup(false);
            return;
        }

        this.popupMessage.setText(
            `You're still in game ${this.savedGames[0].code}.\nRejoin to pick up where you left off.`,
        );
        this.showPopup(true);
    }

    private showPopup(show: boolean) {
        this.popup.setVisible(show);
        this.showPopupStatus("");

        // The text fields are HTML on top of the canvas: hide them under the popup
        for (const input of [this.nameInput, this.catchphraseInput]) {
            input.style.visibility = show ? "hidden" : "visible";
        }
        if (show) {
            this.codeInput.style.display = "none";
        } else {
            this.setMode(this.mode);
        }
    }

    /** While rejoining or leaving: a line of status instead of the choices. */
    private showPopupStatus(text: string) {
        this.popupStatus.setText(text).setVisible(text !== "");
        this.rejoinButton.setVisible(text === "");
        this.leaveLink.setVisible(text === "");
    }

    private rejoinSavedGame() {
        if (this.busy || !this.popup.visible || this.savedGames.length === 0) {
            return;
        }

        this.showPopupStatus(`Rejoining ${this.savedGames[0].code}…`);

        const network = this.connect();

        network.onRejoinFailed = (ended) => {
            this.setBusy(false);
            this.showPopup(false);
            this.showStatus(ended ? "That game has ended." : "Couldn't rejoin that game.", !ended);
        };

        network.rejoin(this.savedGames);
    }

    /** Out of the game for good: the others carry on without you. */
    private leaveSavedGame() {
        const session = this.savedGames[0];
        if (this.busy || !session) {
            return;
        }

        this.showPopupStatus(`Leaving ${session.code}…`);

        this.connect().leave(session, () => {
            this.setBusy(false);

            // Another game you could still rejoin (from a closed tab)
            if (RejoinStore.candidates().length > 0) {
                this.offerSavedGame();
                return;
            }

            this.showPopup(false);
            this.showStatus(`You left game ${session.code}.`);
        });
    }

    /** Keep the menu centred at any size (the sky is the Backdrop scene). */
    private layout() {
        const { width, height, scale } = applyUiScale(this);
        this.uiScale = scale;

        this.menu.setPosition(width / 2, (height - DESIGN_HEIGHT) / 2);

        // The popup covers the whole screen, its card over the green
        this.popupDim.clear();
        this.popupDim.fillStyle(0x060a18, 0.6);
        this.popupDim.fillRect(0, 0, width, height);
        this.popupBlocker.setSize(width, height);
        this.popupCard.setPosition(
            width / 2,
            // Centred on the green (and its lip), which it hides
            Math.max(16, this.menu.y + this.padTop + (PAD_HEIGHT + PAD_LIP - POPUP_HEIGHT) / 2),
        );

        this.positionInput(this.nameInput, 0, this.padTop + 104, INPUT_WIDTH);
        this.positionInput(
            this.catchphraseInput,
            0,
            this.padTop + 230,
            INPUT_WIDTH,
        );
        this.positionInput(
            this.codeInput,
            -ROW_OFFSET,
            this.rowY - 2,
            ROW_BUTTON_WIDTH,
        );
    }

    /** Choosing between Host and Join, or typing a code to join. */
    private setMode(mode: MenuMode) {
        if (this.busy) {
            return;
        }

        this.mode = mode;
        const joining = mode === "join";

        this.hostButton.setVisible(!joining);
        this.joinButton.setVisible(!joining);
        this.confirmJoinButton.setVisible(joining);
        this.backLink.setVisible(joining);
        this.codeInput.style.display = joining ? "block" : "none";

        this.showStatus("");

        if (joining) {
            this.codeInput.focus();
        } else {
            this.codeInput.value = "";
        }
    }

    private showStatus(text: string, isError = false) {
        this.status.setText(text).setColor(isError ? CSS.error : CSS.muted);
    }

    private setBusy(busy: boolean) {
        this.busy = busy;
        this.hostButton.setEnabled(!busy);
        this.joinButton.setEnabled(!busy);
        this.confirmJoinButton.setEnabled(!busy);
        this.rejoinButton.setEnabled(!busy);
        this.leaveLink.setAlpha(busy ? 0.4 : 1);
        this.nameInput.disabled = busy;
        this.catchphraseInput.disabled = busy;
        this.codeInput.disabled = busy;
    }

    private getName() {
        return this.nameInput.value.trim() || this.nameInput.placeholder;
    }

    /** Like the name: the greyed-out suggestion unless you type your own. */
    private getCatchphrase() {
        return (
            this.catchphraseInput.value.trim() ||
            this.catchphraseInput.placeholder
        );
    }

    private hostGame() {
        this.showStatus("Making your game…");
        this.connect().host(this.getName(), this.getCatchphrase());
    }

    private joinGame() {
        const code = this.codeInput.value;

        if (code.length !== CODE_LENGTH) {
            this.showStatus("Codes are 4 letters, like XKLI.", true);
            this.codeInput.focus();
            return;
        }

        this.showStatus(`Joining ${code}…`);
        this.connect().join(
            code,
            this.getName(),
            this.getCatchphrase(),
        );
    }

    /** One connection for the menu, kept if a code is wrong so you can try again. */
    private connect() {
        this.setBusy(true);

        const network = (this.network ??= new Network());

        network.onLobbyJoined = () => {
            this.removeInputs();
            this.scene.start("Game", { network });
        };

        network.onLobbyError = (error) => {
            this.setBusy(false);
            this.showStatus(error, true);

            if (this.mode === "join") {
                this.codeInput.select();
                this.codeInput.focus();
            }
        };

        return network;
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

    private createInputs() {
        this.injectInputStyle();

        this.nameInput = this.createInput("golf-name-input", getRandomName(), 16, "Your name");
        this.nameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.catchphraseInput.focus();
            }
        });

        this.catchphraseInput = this.createInput(
            "golf-name-input",
            getRandomCatchphrase(),
            MAX_CATCHPHRASE_LENGTH,
            "Catchphrase",
        );
        this.catchphraseInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") {
                return;
            }

            if (this.mode === "join") {
                this.codeInput.focus();
            } else {
                this.hostButton.trigger();
            }
        });

        this.codeInput = this.createInput(
            "golf-name-input golf-code-input",
            "CODE",
            CODE_LENGTH,
            "Game code",
        );
        this.codeInput.autocomplete = "off";
        this.codeInput.spellcheck = false;
        this.codeInput.style.display = "none";

        // Codes are capital letters only, however they're typed or pasted
        this.codeInput.addEventListener("input", () => {
            this.codeInput.value = this.codeInput.value
                .toUpperCase()
                .replace(/[^A-Z]/g, "")
                .slice(0, CODE_LENGTH);
        });

        this.codeInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.confirmJoinButton.trigger();
            } else if (event.key === "Escape") {
                this.setMode("choose");
                this.nameInput.focus();
            }
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
            this.removeInputs(),
        );

        this.nameInput.focus();
    }

    private createInput(
        className: string,
        placeholder: string,
        maxLength: number,
        label: string,
    ) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = className;
        input.placeholder = placeholder;
        input.maxLength = maxLength;
        input.setAttribute("aria-label", label);

        document.body.appendChild(input);
        return input;
    }

    private removeInputs() {
        this.nameInput?.remove();
        this.catchphraseInput?.remove();
        this.codeInput?.remove();
    }

    /**
     * Keep an HTML field over the canvas at (x, y) in menu units, wherever
     * the canvas sits and however it is scaled.
     */
    private positionInput(
        input: HTMLInputElement | undefined,
        x: number,
        y: number,
        width: number,
    ) {
        if (!input) {
            return;
        }

        const bounds = this.game.canvas.getBoundingClientRect();
        // Interface units to CSS pixels
        const toCss = this.uiScale * (bounds.width / this.scale.width);

        const fieldHeight = Math.round(INPUT_HEIGHT * toCss);

        Object.assign(input.style, {
            left: `${bounds.left + window.scrollX + (this.menu.x + x) * toCss}px`,
            top: `${bounds.top + window.scrollY + (this.menu.y + y) * toCss}px`,
            width: `${width * toCss}px`,
            height: `${fieldHeight}px`,
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
            /*
             * Adventor's font file says its letters are shorter than they
             * are, and Chrome clips text in a field (placeholders too) to
             * that: accents like Å and É and the tops of capitals get cut.
             * The fields use the same files with the real heights.
             */
            @font-face {
                font-family: "${FIELD_FONT}";
                src: url("assets/fonts/texgyreadventor-regular.otf") format("opentype");
                ascent-override: 110%;
                descent-override: 30%;
            }
            @font-face {
                font-family: "${FIELD_FONT_BOLD}";
                src: url("assets/fonts/texgyreadventor-bold.otf") format("opentype");
                ascent-override: 110%;
                descent-override: 30%;
            }
            .golf-name-input {
                position: absolute;
                transform: translate(-50%, -50%);
                box-sizing: border-box;
                padding: 0 16px;
                border: none;
                border-radius: 14px;
                background: #eef1fb;
                color: ${CSS.ink};
                font-family: "${FIELD_FONT_BOLD}", ${FONTS.bold};
                text-align: center;
                box-shadow: 0 4px 0 #3f7a1f;
                outline: none;
            }
            .golf-name-input::placeholder {
                color: #6b7a63;
                font-family: "${FIELD_FONT}", ${FONTS.regular};
            }
            .golf-code-input {
                letter-spacing: 0.3em;
                text-indent: 0.3em;
            }
            .golf-code-input::placeholder {
                letter-spacing: 0.15em;
            }
            .golf-name-input:disabled {
                opacity: 0.7;
            }
            .golf-name-input:focus-visible {
                box-shadow: 0 4px 0 #3f7a1f, 0 0 0 3px #121a35;
            }
        `;

        document.head.appendChild(style);

        // Load them now rather than when the fields first draw
        void document.fonts.load(`22px "${FIELD_FONT}"`);
        void document.fonts.load(`22px "${FIELD_FONT_BOLD}"`);
    }
}
