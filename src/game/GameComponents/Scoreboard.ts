import * as Phaser from "phaser";
import { Player } from "../../../server/types/types";
import {
    COLORS,
    CSS,
    TYPE,
    addText,
    drawPanel,
    drawPennant,
} from "../ui/theme";
import { Button } from "../ui/Button";

const PADDING = 32;
const ROW_HEIGHT = 44;
const RANK_WIDTH = 36;
const NAME_WIDTH = 220;
const HOLE_WIDTH = 46;
const TOTAL_WIDTH = 70;
/** Older holes scroll off so the card always fits the screen. */
const MAX_HOLE_COLUMNS = 12;
/** Space under the table for Play again on the final scores. */
const FINAL_FOOTER_HEIGHT = 96;

/** Total shots, skipping holes the player didn't play. */
function getTotal(player: Player) {
    return (player.state?.points ?? []).reduce<number>(
        (sum, score) => sum + (score ?? 0),
        0,
    );
}

function getHolesPlayed(player: Player) {
    return (player.state?.points ?? []).filter((score) => score !== null)
        .length;
}

/** Players who played every hole rank first, then by fewest shots. */
function rank(players: Player[]) {
    return [...players].sort(
        (a, b) =>
            getHolesPlayed(b) - getHolesPlayed(a) ||
            getTotal(a) - getTotal(b),
    );
}

/** Between holes: standings with a countdown to the next hole. */
interface HoleView {
    kind: "hole";
    players: Player[];
    ownId: string;
    endsAt: number;
}

/** After the last hole: the winner, final scores and Play again. */
interface FinalView {
    kind: "final";
    players: Player[];
    ownId: string;
    isHost: boolean;
    hostName: string;
    onPlayAgain: () => void;
}

type View = HoleView | FinalView;

/**
 * Standings on a card over the dimmed course with every player's shots per
 * hole: between holes (with a countdown) and at the end of the game.
 */
export class Scoreboard {
    private readonly container: Phaser.GameObjects.Container;
    private countdown?: Phaser.Time.TimerEvent;
    private playAgainButton?: Button;

    /** Screen size in interface units, set by layout(). */
    private screenWidth = 0;
    private screenHeight = 0;

    /** What is on show, so a resize can redraw it. */
    private current?: View;

    constructor(private readonly scene: Phaser.Scene) {
        this.container = scene.add.container(0, 0).setDepth(10);
        this.container.setVisible(false);
    }

    /** Called on every resize with the screen size in interface units. */
    layout(width: number, height: number) {
        this.screenWidth = width;
        this.screenHeight = height;

        if (this.current && this.container.visible) {
            this.render(this.current, false);
        }
    }

    /** Standings between holes, counting down to the next one. */
    show(players: Player[], ownId: string, durationMs: number) {
        this.render(
            { kind: "hole", players, ownId, endsAt: Date.now() + durationMs },
            true,
        );
    }

    /** Final scores after the last hole. Only the host can start a new game. */
    showFinal(
        players: Player[],
        ownId: string,
        isHost: boolean,
        hostName: string,
        onPlayAgain: () => void,
    ) {
        this.render(
            { kind: "final", players, ownId, isHost, hostName, onPlayAgain },
            true,
        );
    }

    /** The host changed while the final scores are up (the old host left). */
    updateHost(isHost: boolean, hostName: string) {
        if (this.current?.kind !== "final" || !this.container.visible) {
            return;
        }

        this.render({ ...this.current, isHost, hostName }, false);
    }

    /** Enter key on the final scores. */
    triggerPlayAgain() {
        this.playAgainButton?.trigger();
    }

    private render(view: View, animate: boolean) {
        this.container.removeAll(true);
        this.countdown?.remove();
        this.playAgainButton = undefined;

        this.current = view;

        const { players, ownId } = view;
        const isFinal = view.kind === "final";

        const screenWidth = this.screenWidth;
        const screenHeight = this.screenHeight;

        const sorted = rank(players);

        // Everyone level with the best player (same holes, same total) leads
        const best = sorted[0];
        const leaders =
            best && getHolesPlayed(best) > 0
                ? sorted.filter(
                      (player) =>
                          getHolesPlayed(player) === getHolesPlayed(best) &&
                          getTotal(player) === getTotal(best),
                  )
                : [];

        const holeCount = Math.max(
            0,
            ...sorted.map((player) => player.state?.points.length ?? 0),
        );
        const firstHole = Math.max(0, holeCount - MAX_HOLE_COLUMNS);
        const holes = Array.from(
            { length: holeCount - firstHole },
            (_, i) => firstHole + i,
        );

        const cardWidth =
            PADDING * 2 +
            RANK_WIDTH +
            NAME_WIDTH +
            holes.length * HOLE_WIDTH +
            TOTAL_WIDTH;
        const cardHeight =
            PADDING * 2 +
            44 +
            30 +
            34 +
            sorted.length * ROW_HEIGHT +
            (isFinal ? FINAL_FOOTER_HEIGHT : 0);

        const left = Math.round((screenWidth - cardWidth) / 2);
        const top = Math.round((screenHeight - cardHeight) / 2);

        // Dim the course behind the card
        const backdrop = this.scene.add.graphics();
        backdrop.fillStyle(0x060a18, 0.6);
        backdrop.fillRect(0, 0, screenWidth, screenHeight);

        const card = this.scene.add.graphics();
        drawPanel(card, left, top, cardWidth, cardHeight, 20, 0.98);

        this.container.add([backdrop, card]);

        let y = top + PADDING;

        const title = addText(
            this.scene,
            left + PADDING,
            y,
            isFinal
                ? this.getWinnerTitle(leaders, ownId)
                : `Hole ${holeCount} complete`,
            { size: TYPE.title, bold: true },
        );

        // Countdown between holes; on the final scores just what this is
        const countdownText = addText(
            this.scene,
            left + cardWidth - PADDING,
            y + 10,
            isFinal ? `Final scores, ${holeCount} holes` : "",
            { size: TYPE.body, color: CSS.muted },
        ).setOrigin(1, 0);

        this.container.add([title, countdownText]);

        y += 44 + 30;

        // Column headings: hole numbers, then total
        const holesLeft = left + PADDING + RANK_WIDTH + NAME_WIDTH;
        const totalX = holesLeft + holes.length * HOLE_WIDTH + TOTAL_WIDTH;

        holes.forEach((hole, column) => {
            this.container.add(
                addText(
                    this.scene,
                    holesLeft + column * HOLE_WIDTH + HOLE_WIDTH / 2,
                    y,
                    `${hole + 1}`,
                    { size: TYPE.small, color: CSS.muted },
                ).setOrigin(0.5, 0),
            );
        });

        this.container.add(
            addText(this.scene, totalX, y, "Total", {
                size: TYPE.small,
                color: CSS.muted,
            }).setOrigin(1, 0),
        );

        y += 34;

        // Rows
        sorted.forEach((player, index) => {
            const centerY = y + ROW_HEIGHT / 2;
            const isOwn = player.id === ownId;
            const isLeader = leaders.includes(player);

            if (isOwn) {
                card.fillStyle(COLORS.panelHighlight, 1);
                card.fillRoundedRect(
                    left + PADDING / 2,
                    y + 2,
                    cardWidth - PADDING,
                    ROW_HEIGHT - 4,
                    10,
                );
            }

            // The leader (or everyone tied for the lead) holds the flag
            if (isLeader) {
                drawPennant(
                    card,
                    left + PADDING + 6,
                    centerY + 10,
                    20,
                    COLORS.fairway,
                    COLORS.text,
                );
            } else {
                this.container.add(
                    addText(
                        this.scene,
                        left + PADDING + 4,
                        centerY,
                        `${index + 1}`,
                        { size: TYPE.body, color: CSS.muted },
                    ).setOrigin(0, 0.5),
                );
            }

            const dot = this.scene.add.graphics();
            dot.fillStyle(player.color ?? 0xffffff, 1);
            dot.fillCircle(left + PADDING + RANK_WIDTH + 7, centerY, 7);

            const name = addText(
                this.scene,
                left + PADDING + RANK_WIDTH + 24,
                centerY,
                isOwn ? `${player.name} (you)` : player.name,
                { size: TYPE.body, bold: isOwn },
            ).setOrigin(0, 0.5);

            const maxNameWidth = NAME_WIDTH - 32;
            if (name.width > maxNameWidth) {
                name.setCrop(0, 0, maxNameWidth, name.height);
            }

            this.container.add([dot, name]);

            const points = player.state?.points ?? [];

            holes.forEach((hole, column) => {
                const score = points[hole];

                this.container.add(
                    addText(
                        this.scene,
                        holesLeft + column * HOLE_WIDTH + HOLE_WIDTH / 2,
                        centerY,
                        score === null || score === undefined ? "–" : `${score}`,
                        {
                            size: TYPE.body,
                            color:
                                score === null || score === undefined
                                    ? CSS.muted
                                    : CSS.text,
                        },
                    ).setOrigin(0.5),
                );
            });

            this.container.add(
                addText(this.scene, totalX, centerY, `${getTotal(player)}`, {
                    size: TYPE.label,
                    bold: true,
                    color: isLeader ? CSS.fairway : CSS.text,
                }).setOrigin(1, 0.5),
            );

            y += ROW_HEIGHT;
        });

        if (view.kind === "final") {
            this.addFinalFooter(view, left, cardWidth, y);
        } else {
            this.startCountdown(countdownText, view.endsAt - Date.now());
        }

        // One entrance: the card settles in (not again when redrawn on resize)
        this.container.setVisible(true);

        if (animate) {
            this.container.setAlpha(0);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 1,
                duration: 250,
                ease: "Quad.easeOut",
            });
        }
    }

    private getWinnerTitle(leaders: Player[], ownId: string) {
        if (leaders.length === 0) {
            return "Game over";
        }

        if (leaders.length > 1) {
            return "It's a tie!";
        }

        return leaders[0].id === ownId ? "You win!" : `${leaders[0].name} wins!`;
    }

    /** Play again for the host; everyone else is told who they are waiting for. */
    private addFinalFooter(
        view: FinalView,
        left: number,
        cardWidth: number,
        tableBottom: number,
    ) {
        const centerX = left + cardWidth / 2;
        const centerY = tableBottom + FINAL_FOOTER_HEIGHT / 2 + 4;

        if (view.isHost) {
            this.playAgainButton = new Button(
                this.scene,
                centerX,
                centerY,
                "Play again",
                240,
            ).setOnClick(view.onPlayAgain);

            this.container.add(this.playAgainButton);
            return;
        }

        this.container.add(
            addText(
                this.scene,
                centerX,
                centerY,
                `Waiting for ${view.hostName} to start a new game`,
                { size: TYPE.body, color: CSS.muted },
            ).setOrigin(0.5),
        );
    }

    /** Count down to the next hole in whole seconds. */
    private startCountdown(
        countdownText: Phaser.GameObjects.Text,
        durationMs: number,
    ) {
        durationMs = Math.max(0, durationMs);

        let secondsLeft = Math.ceil(durationMs / 1000);
        const countdownLabel = () =>
            secondsLeft > 0 ? `Next hole in ${secondsLeft}` : "Teeing off";

        countdownText.setText(countdownLabel());

        if (secondsLeft > 0) {
            // Tick on the whole seconds that remain
            this.countdown = this.scene.time.addEvent({
                delay: durationMs - (secondsLeft - 1) * 1000,
                callback: () => {
                    secondsLeft -= 1;
                    countdownText.setText(countdownLabel());

                    if (secondsLeft > 0) {
                        this.countdown = this.scene.time.addEvent({
                            delay: 1000,
                            repeat: secondsLeft - 1,
                            callback: () => {
                                secondsLeft -= 1;
                                countdownText.setText(countdownLabel());
                            },
                        });
                    }
                },
            });
        }
    }

    hide() {
        this.countdown?.remove();
        this.countdown = undefined;
        this.current = undefined;
        this.playAgainButton = undefined;
        this.container.setVisible(false);
    }

    destroy() {
        this.hide();
        this.container.destroy();
    }
}
