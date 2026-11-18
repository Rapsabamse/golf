import * as Phaser from "phaser";
import { GameState, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { PlayerPanel } from "./PlayerPanel";
import { LobbyScreen } from "./LobbyScreen";
import { PowerBar } from "./PowerBar";
import { Button } from "../ui/Button";
import {
    COLORS,
    CSS,
    MARGIN,
    TYPE,
    addText,
    drawPanel,
    drawPennant,
    joinNames,
} from "../ui/theme";

const CARD_WIDTH = 380;
const CARD_PADDING = 22;
const TAG_HEIGHT = 30;
const TOAST_DURATION_MS = 2200;
/** The shot clock turns red (and ticks, if you still have to lock in) from here. */
const CLOCK_URGENT_SECONDS = 5;
const CODE_BOX_PADDING_X = 16;
const CODE_BOX_PADDING_Y = 10;

interface StatusCopy {
    title: string;
    /** Only for something you can't tell from the screen, like who we're waiting for. */
    body?: string;
    /** lockedIn: the Lock in button stays, greyed out, until everyone's in. */
    action?: "start" | "lockIn" | "lockedIn";
}

/**
 * The interface during a game: a status card top-left telling you what is
 * happening and what to do, the main action button bottom-centre, the
 * players panel top-right and the controls bottom-left.
 */
export class GameUI {
    private readonly scene: Phaser.Scene;

    private card!: Phaser.GameObjects.Container;
    private cardBackground!: Phaser.GameObjects.Graphics;
    private holeTag!: Phaser.GameObjects.Graphics;
    private holeTagText!: Phaser.GameObjects.Text;
    private title!: Phaser.GameObjects.Text;
    private body!: Phaser.GameObjects.Text;

    private actionButton!: Button;
    private toast!: Phaser.GameObjects.Container;
    private toastBackground!: Phaser.GameObjects.Graphics;
    private toastText!: Phaser.GameObjects.Text;
    private toastTimer?: Phaser.Time.TimerEvent;

    private controls!: Phaser.GameObjects.Container;
    /** The room code, bottom-right, so friends can join at any time. */
    private codeBox!: Phaser.GameObjects.Container;
    /** Shown instead of the course while waiting to start. */
    private lobbyScreen!: LobbyScreen;

    private playerPanel!: PlayerPanel;
    private powerBar!: PowerBar;

    /** True once the server has confirmed our locked-in shot this phase. */
    private isReady = false;
    /** Shot clock: where it's drawn, and when it runs out (scene time). */
    private shotClockText!: Phaser.GameObjects.Text;
    private shotClockEndsAt?: number;
    private lastClockSecond?: number;
    /** Plays a tick in the last seconds, while you still have to lock in. */
    onClockTick?: () => void;
    private hole?: number;
    private lastState: GameState = GameState.WAITING;
    private lastShouldWait = false;

    constructor(
        hud: Phaser.Scene,
        private network: Network,
        private lockIn: () => void,
        private haveIScored: () => boolean,
        private isMuted: () => boolean,
    ) {
        this.scene = hud;
        this.create();
    }

    /** Everything is placed properly by layout(), called right after this. */
    private create() {
        const width = 0;
        const height = 0;

        // Status card
        this.cardBackground = this.scene.add.graphics();
        this.holeTag = this.scene.add.graphics();
        this.holeTagText = addText(this.scene, 0, 0, "", {
            size: TYPE.small,
            bold: true,
            color: CSS.ink,
        }).setOrigin(0, 0.5);
        this.title = addText(this.scene, 0, 0, "", {
            size: TYPE.title,
            bold: true,
        });
        this.body = addText(this.scene, 0, 0, "", {
            size: TYPE.body,
            color: CSS.muted,
            wrap: CARD_WIDTH - CARD_PADDING * 2,
            lineSpacing: 4,
        });

        this.shotClockText = addText(this.scene, 0, 0, "", {
            size: TYPE.label,
            bold: true,
            color: CSS.muted,
        })
            .setOrigin(1, 0.5)
            .setVisible(false);

        this.card = this.scene.add.container(MARGIN, MARGIN, [
            this.cardBackground,
            this.holeTag,
            this.holeTagText,
            this.title,
            this.body,
            this.shotClockText,
        ]);


        // Main action
        this.actionButton = new Button(
            this.scene,
            width / 2,
            height - MARGIN - 34,
            "",
        ).setVisible(false);

        // Toast above the button
        this.toastBackground = this.scene.add.graphics();
        this.toastText = addText(this.scene, 0, 0, "", {
            size: TYPE.body,
        }).setOrigin(0.5);
        this.toast = this.scene.add
            .container(width / 2, height - MARGIN - 150, [
                this.toastBackground,
                this.toastText,
            ])
            .setAlpha(0);

        // Shot power, above the main button
        this.powerBar = new PowerBar(this.scene, width / 2, height - MARGIN - 100);

        this.createControls();
        this.createCodeBox();
        this.lobbyScreen = new LobbyScreen(this.scene, this.network);

        this.playerPanel = new PlayerPanel(this.scene, this.network);
    }

    updateUI(gameState: GameState, shouldWait?: boolean) {
        if (gameState !== GameState.PLANNING) {
            this.isReady = false;
        }

        this.lastState = gameState;
        this.lastShouldWait = !!shouldWait;

        // The lobby has a screen of its own; everything else is for holes
        const inLobby = gameState === GameState.WAITING;
        this.lobbyScreen.setVisible(inLobby);
        this.codeBox.setVisible(!inLobby && this.network.getLobbyCode() !== "");

        const copy = this.getStatusCopy(gameState, !!shouldWait);

        if (copy) {
            this.showCard(copy);
        } else {
            this.card.setVisible(false);
        }

        this.updateActionButton(copy?.action);
        this.playerPanel.update(gameState);
        this.updateControls();
    }

    /** Redraw the parts that show the sound setting. */
    refreshPlayerPanel(gameState: GameState) {
        this.playerPanel.update(gameState);
        this.lobbyScreen.update();
        this.updateControls();
    }

    setHole(hole: number | undefined) {
        this.hole = hole;
    }

    setReady() {
        this.isReady = true;
        this.updateUI(this.lastState, this.lastShouldWait);
    }

    /** Short message above the action button that fades by itself. */
    /**
     * Time left to lock in this shot (undefined: no clock, e.g. between
     * shots). Kept as a deadline on our own clock, then counted down here.
     */
    setShotClock(ms?: number) {
        this.shotClockEndsAt =
            ms === undefined ? undefined : this.scene.time.now + ms;
        this.lastClockSecond = undefined;
        this.updateShotClock();
    }

    /** Call every frame: counts the shot clock down between server updates. */
    update() {
        this.updateShotClock();
    }

    private updateShotClock() {
        const endsAt = this.shotClockEndsAt;
        const show =
            endsAt !== undefined &&
            this.lastState === GameState.PLANNING &&
            this.card.visible;

        this.shotClockText.setVisible(show);
        if (!show) {
            return;
        }

        const seconds = Math.max(
            0,
            Math.ceil((endsAt - this.scene.time.now) / 1000),
        );

        // Redrawing text is slow: only when the second changes
        if (seconds === this.lastClockSecond) {
            return;
        }

        const urgent = seconds <= CLOCK_URGENT_SECONDS;

        this.shotClockText
            .setText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`)
            .setColor(urgent ? CSS.error : CSS.muted);

        // Tick each second at the end, but only if you still have to act
        const mustShoot =
            !this.isReady && !this.haveIScored() && !this.lastShouldWait;

        if (urgent && seconds > 0 && mustShoot) {
            this.onClockTick?.();
        }

        this.lastClockSecond = seconds;
    }

    /** The connection dropped: say how to get back in, until the page is reloaded. */
    showConnectionLost() {
        this.showHint("Connection lost. Refresh the page to rejoin.");
        this.toastTimer?.remove();
        this.toastTimer = undefined;
    }

    showHint(text: string) {
        this.toastText.setText(text);

        const width = this.toastText.width + 40;
        const height = this.toastText.height + 20;

        this.toastBackground.clear();
        this.toastBackground.fillStyle(COLORS.panel, 0.95);
        this.toastBackground.fillRoundedRect(
            -width / 2,
            -height / 2,
            width,
            height,
            height / 2,
        );
        this.toastBackground.lineStyle(1.5, COLORS.fairway, 1);
        this.toastBackground.strokeRoundedRect(
            -width / 2,
            -height / 2,
            width,
            height,
            height / 2,
        );

        this.scene.tweens.killTweensOf(this.toast);
        this.toastTimer?.remove();

        this.toast.setAlpha(1);
        this.toastTimer = this.scene.time.delayedCall(TOAST_DURATION_MS, () => {
            this.scene.tweens.add({
                targets: this.toast,
                alpha: 0,
                duration: 300,
            });
        });
    }

    /**
     * Anchor everything to the screen edges. `width`/`height` are the screen
     * size in interface units (see ui/layout.ts). Called on every resize.
     */
    layout(width: number, height: number) {
        // The status card stays top-left at (MARGIN, MARGIN)
        this.actionButton.setPosition(width / 2, height - MARGIN - 34);
        this.toast.setPosition(width / 2, height - MARGIN - 150);
        this.powerBar.setCenter(width / 2, height - MARGIN - 100);
        this.controls.setPosition(MARGIN, height - MARGIN);
        this.playerPanel.setScreenWidth(width);
        this.codeBox.setPosition(
            width - MARGIN - this.codeBox.width,
            height - MARGIN - this.codeBox.height,
        );
        this.lobbyScreen.layout(width, height);
    }

    /** A small box with the room code; layout() keeps it in the corner. */
    private createCodeBox() {
        const label = addText(this.scene, CODE_BOX_PADDING_X, CODE_BOX_PADDING_Y, "Room code", {
            size: TYPE.small,
            color: CSS.muted,
        });

        const code = addText(
            this.scene,
            CODE_BOX_PADDING_X,
            label.y + label.height + 2,
            this.network.getLobbyCode(),
            { size: TYPE.label, bold: true },
        ).setLetterSpacing(4);

        const width =
            Math.max(label.width, code.width) + CODE_BOX_PADDING_X * 2;
        const height = code.y + code.height + CODE_BOX_PADDING_Y;

        const background = this.scene.add.graphics();
        drawPanel(background, 0, 0, width, height, 12);

        this.codeBox = this.scene.add
            .container(0, 0, [background, label, code])
            .setSize(width, height)
            .setVisible(this.network.getLobbyCode() !== "");
    }

    /** Show the charge while aiming (0..1), or hide the bar with undefined. */
    setCharge(charge: number | undefined) {
        this.powerBar.setCharge(charge);
    }

    /** Run the main action (Enter key). */
    triggerAction() {
        if (this.lobbyScreen.visible) {
            this.lobbyScreen.trigger();
        } else {
            this.actionButton.trigger();
        }
    }

    private getStatusCopy(
        gameState: GameState,
        shouldWait: boolean,
    ): StatusCopy | undefined {
        const players = this.network.getPlayers();
        const ownId = this.network.getPlayerId();
        const self = players.find((player) => player.id === ownId);
        const others = players.filter((player) => player.id !== ownId);

        if (
            shouldWait &&
            gameState !== GameState.ROUND_COMPLETE &&
            gameState !== GameState.GAME_OVER
        ) {
            return {
                title: "Hole in progress",
                body: "You'll tee off on the next hole.",
            };
        }

        switch (gameState) {
            // The lobby screen covers this
            case GameState.WAITING:
                return undefined;

            case GameState.PLANNING: {
                const shots = self?.roundState?.shots ?? 0;
                const stillPlaying = (player: Player) =>
                    !player.waitingForNextRound && !player.roundState?.hasScored;

                if (this.haveIScored()) {
                    const unfinished = others
                        .filter(stillPlaying)
                        .map((player) => player.name);

                    return {
                        title: `Holed in ${shots}`,
                        body: unfinished.length
                            ? `Waiting for ${joinNames(unfinished)} to finish the hole.`
                            : undefined,
                    };
                }

                if (this.isReady) {
                    const aiming = others
                        .filter((player) => stillPlaying(player) && !player.ready)
                        .map((player) => player.name);

                    return {
                        title: `Shot ${shots + 1}`,
                        action: "lockedIn",
                        body: aiming.length
                            ? `Waiting for ${joinNames(aiming)} to lock in.`
                            : undefined,
                    };
                }

                return { title: `Shot ${shots + 1}`, action: "lockIn" };
            }

            // The course and the scoreboard speak for themselves here
            default:
                return undefined;
        }
    }

    private showCard({ title, body }: StatusCopy) {
        let y = CARD_PADDING;
        let tagWidth = 0;

        // Hole tag: the pennant with the hole number
        const showTag =
            this.hole !== undefined && this.lastState !== GameState.WAITING;

        this.holeTag.clear();
        this.holeTag.setVisible(showTag);
        this.holeTagText.setVisible(showTag);

        if (showTag) {
            this.holeTagText.setText(`Hole ${this.hole}`);

            tagWidth = this.holeTagText.width + 46;

            this.holeTag.fillStyle(COLORS.fairway, 1);
            this.holeTag.fillRoundedRect(
                CARD_PADDING,
                y,
                tagWidth,
                TAG_HEIGHT,
                TAG_HEIGHT / 2,
            );
            drawPennant(
                this.holeTag,
                CARD_PADDING + 15,
                y + TAG_HEIGHT / 2 + 8,
                16,
                COLORS.ink,
                COLORS.ink,
            );

            this.holeTagText.setPosition(CARD_PADDING + 32, y + TAG_HEIGHT / 2 + 1);

            y += TAG_HEIGHT + 14;
        }

        this.title.setText(title).setPosition(CARD_PADDING, y);
        y += this.title.height;

        // Most cards are just a title
        this.body.setVisible(body !== undefined);

        if (body !== undefined) {
            this.body.setText(body).setPosition(CARD_PADDING, y + 6);
            y += 6 + this.body.height;
        }

        y += CARD_PADDING;

        // Room for the shot clock beside the hole tag
        const clockRoom = showTag ? tagWidth + 16 + this.clockWidth() : 0;

        const cardWidth = Math.min(
            CARD_WIDTH,
            Math.max(
                this.title.width,
                body !== undefined ? this.body.width : 0,
                clockRoom,
                160,
            ) +
                CARD_PADDING * 2,
        );

        this.shotClockText.setPosition(
            cardWidth - CARD_PADDING,
            CARD_PADDING + TAG_HEIGHT / 2 + 1,
        );

        this.cardBackground.clear();
        drawPanel(this.cardBackground, 0, 0, cardWidth, y);

        this.card.setVisible(true);
    }

    /** Widest the clock gets, so the card doesn't change size as it counts. */
    private clockWidth() {
        const text = this.shotClockText.text;
        const width = this.shotClockText.setText("0:00").width;
        this.shotClockText.setText(text);
        return width;
    }

        private updateActionButton(action?: StatusCopy["action"]) {
        if (!action) {
            this.actionButton.setVisible(false);
            return;
        }

        if (action === "start") {
            this.actionButton
                .setText("Start game")
                .setEnabled(true)
                .setOnClick(() => this.network.startGame());
        } else if (action === "lockIn") {
            this.actionButton
                .setText("Lock in shot")
                .setEnabled(true)
                .setOnClick(() => this.lockIn());
        } else {
            this.actionButton.setText("Shot locked in").setEnabled(false);
        }

        this.actionButton.setVisible(true);
    }

    /** Key hints bottom-left: [M] Sound on   [Scroll] Zoom   [Enter] … */
    private createControls() {
        this.controls = this.scene.add.container(MARGIN, 0);
    }

    private updateControls() {
        this.controls.removeAll(true);

        const inLobby = this.lastState === GameState.WAITING;
        const hints: [string, string][] = [
            ["M", this.isMuted() ? "Sound off" : "Sound on"],
        ];

        // There's no course to zoom in the lobby
        if (!inLobby) {
            hints.push(["Scroll", "Zoom"]);
        }

        if (inLobby) {
            if (this.network.getIsHost()) {
                hints.push(["Enter", "Start"]);
            }
        } else if (this.actionButton.visible && this.actionButton.isEnabled()) {
            // No Enter hint while the button is greyed out
            hints.push(["Enter", "Lock in"]);
        } else if (
            this.lastState === GameState.GAME_OVER &&
            this.network.getIsHost()
        ) {
            hints.push(["Enter", "Play again"]);
        }

        let x = 0;

        for (const [key, label] of hints) {
            const capHeight = 26;
            const middle = -capHeight / 2;

            const keyText = addText(this.scene, 0, 0, key, {
                size: TYPE.small - 1,
                bold: true,
                color: CSS.text,
            }).setOrigin(0, 0.5);

            const capWidth = keyText.width + 16;

            const cap = this.scene.add.graphics();
            cap.fillStyle(COLORS.panel, 0.85);
            cap.fillRoundedRect(x, -capHeight, capWidth, capHeight, 6);
            cap.lineStyle(1.5, COLORS.panelEdge, 1);
            cap.strokeRoundedRect(x, -capHeight, capWidth, capHeight, 6);

            keyText.setPosition(x + 8, middle + 1);

            const labelText = addText(
                this.scene,
                x + capWidth + 8,
                middle + 1,
                label,
                { size: TYPE.small, color: CSS.muted },
            ).setOrigin(0, 0.5);

            this.controls.add([cap, keyText, labelText]);

            x += capWidth + 8 + labelText.width + 22;
        }
    }
}
