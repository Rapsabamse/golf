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

const PADDING = 32;
const ROW_HEIGHT = 44;
const RANK_WIDTH = 36;
const NAME_WIDTH = 220;
const HOLE_WIDTH = 46;
const TOTAL_WIDTH = 70;
/** Older holes scroll off so the card always fits the screen. */
const MAX_HOLE_COLUMNS = 12;

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

/**
 * Standings between holes: a card over the dimmed course with every
 * player's shots per hole, and a countdown to the next hole.
 */
export class Scoreboard {
    private readonly container: Phaser.GameObjects.Container;
    private countdown?: Phaser.Time.TimerEvent;

    /** Screen size in interface units, set by layout(). */
    private screenWidth = 0;
    private screenHeight = 0;

    /** What is on show, so a resize can redraw it. */
    private current?: { players: Player[]; ownId: string; endsAt: number };

    constructor(private readonly scene: Phaser.Scene) {
        this.container = scene.add.container(0, 0).setDepth(10);
        this.container.setVisible(false);
    }

    /** Called on every resize with the screen size in interface units. */
    layout(width: number, height: number) {
        this.screenWidth = width;
        this.screenHeight = height;

        if (this.current && this.container.visible) {
            const { players, ownId, endsAt } = this.current;
            this.show(players, ownId, Math.max(0, endsAt - Date.now()), false);
        }
    }

    show(players: Player[], ownId: string, durationMs: number, animate = true) {
        this.container.removeAll(true);
        this.countdown?.remove();

        this.current = { players, ownId, endsAt: Date.now() + durationMs };

        const screenWidth = this.screenWidth;
        const screenHeight = this.screenHeight;

        // Players who played every hole rank first, then by fewest shots
        const sorted = [...players].sort(
            (a, b) =>
                getHolesPlayed(b) - getHolesPlayed(a) ||
                getTotal(a) - getTotal(b),
        );

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
            PADDING * 2 + 44 + 30 + 34 + sorted.length * ROW_HEIGHT;

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
            `Hole ${holeCount} complete`,
            { size: TYPE.title, bold: true },
        );

        const countdownText = addText(
            this.scene,
            left + cardWidth - PADDING,
            y + 10,
            "",
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
            const isLeader = index === 0 && getHolesPlayed(player) > 0;

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

            // The leader holds the flag
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

        // Countdown to the next hole
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

    hide() {
        this.countdown?.remove();
        this.countdown = undefined;
        this.current = undefined;
        this.container.setVisible(false);
    }

    destroy() {
        this.hide();
        this.container.destroy();
    }
}
