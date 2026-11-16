import * as Phaser from "phaser";
import { GameState, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { PlayerPanel } from "./PlayerPanel";
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

interface StatusCopy {
    title: string;
    body: string;
    action?: "start" | "lockIn";
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

    private playerPanel!: PlayerPanel;
    private powerBar!: PowerBar;

    /** True once the server has confirmed our locked-in shot this phase. */
    private isReady = false;
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

        this.card = this.scene.add.container(MARGIN, MARGIN, [
            this.cardBackground,
            this.holeTag,
            this.holeTagText,
            this.title,
            this.body,
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

        this.playerPanel = new PlayerPanel(this.scene, this.network);
    }

    updateUI(gameState: GameState, isHost?: boolean, shouldWait?: boolean) {
        if (gameState !== GameState.PLANNING) {
            this.isReady = false;
        }

        this.lastState = gameState;
        this.lastShouldWait = !!shouldWait;

        const copy = this.getStatusCopy(gameState, !!isHost, !!shouldWait);

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
        this.updateControls();
    }

    setHole(hole: number | undefined) {
        this.hole = hole;
    }

    setReady() {
        this.isReady = true;
        this.updateUI(
            this.lastState,
            this.network.getIsHost(),
            this.lastShouldWait,
        );
    }

    /** Short message above the action button that fades by itself. */
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
    }

    /** Show the charge while aiming (0..1), or hide the bar with undefined. */
    setCharge(charge: number | undefined) {
        this.powerBar.setCharge(charge);
    }

    /** Run the main action (Enter key). */
    triggerAction() {
        this.actionButton.trigger();
    }

    private getStatusCopy(
        gameState: GameState,
        isHost: boolean,
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
                body: "You'll tee off on the next hole. Watch how the others play this one.",
            };
        }

        switch (gameState) {
            case GameState.WAITING: {
                if (!isHost) {
                    const host = players.find(
                        (player) => player.id === this.network.getHostId(),
                    );

                    return {
                        title: "Lobby",
                        body: `Waiting for ${host?.name ?? "the host"} to start the game.`,
                    };
                }

                return {
                    title: "Lobby",
                    body:
                        others.length === 0
                            ? "Just you so far. Start when your friends have joined."
                            : `${players.length} players here. Start when everyone has joined.`,
                    action: "start",
                };
            }

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
                            : "Nice. The hole is wrapping up.",
                    };
                }

                if (this.isReady) {
                    const aiming = others
                        .filter((player) => stillPlaying(player) && !player.ready)
                        .map((player) => player.name);

                    return {
                        title: "Shot locked in",
                        body: aiming.length
                            ? `Waiting for ${joinNames(aiming)} to lock in.`
                            : "Everyone's in. Here we go.",
                    };
                }

                return {
                    title: `Shot ${shots + 1}`,
                    body: "Drag back from your ball to aim, then lock in your shot.",
                    action: "lockIn",
                };
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
        y += this.title.height + 6;

        this.body.setText(body).setPosition(CARD_PADDING, y);
        y += this.body.height + CARD_PADDING;

        const cardWidth = Math.min(
            CARD_WIDTH,
            Math.max(this.title.width, this.body.width, tagWidth, 220) +
                CARD_PADDING * 2,
        );

        this.cardBackground.clear();
        drawPanel(this.cardBackground, 0, 0, cardWidth, y);

        this.card.setVisible(true);
    }

    private updateActionButton(action?: StatusCopy["action"]) {
        if (!action) {
            this.actionButton.setVisible(false);
            return;
        }

        if (action === "start") {
            this.actionButton
                .setText("Start game")
                .setOnClick(() => this.network.startGame());
        } else {
            this.actionButton
                .setText("Lock in shot")
                .setOnClick(() => this.lockIn());
        }

        this.actionButton.setVisible(true);
    }

    /** Key hints bottom-left: [M] Sound on   [Scroll] Zoom   [Enter] … */
    private createControls() {
        this.controls = this.scene.add.container(MARGIN, 0);
    }

    private updateControls() {
        this.controls.removeAll(true);

        const hints: [string, string][] = [
            ["M", this.isMuted() ? "Sound off" : "Sound on"],
            ["Scroll", "Zoom"],
        ];

        if (this.actionButton.visible) {
            hints.push([
                "Enter",
                this.lastState === GameState.WAITING ? "Start" : "Lock in",
            ]);
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
