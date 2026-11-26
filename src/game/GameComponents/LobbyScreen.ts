import * as Phaser from "phaser";
import { Network } from "../Networking/Network";
import { Button } from "../ui/Button";
import { COLORS, CSS, TYPE, addText, fitText, drawPanel } from "../ui/theme";
import { COURSES } from "../../../server/types/types";

const ROW_HEIGHT = 40;
const ROWS_PER_COLUMN = 6;
const COURSE_CARD_WIDTH = 232;
const COURSE_CARD_HEIGHT = 96;
const COURSE_CARD_GAP = 14;
const MAX_COLUMNS = 3;
const COLUMN_WIDTH = 300;
const COLUMN_GAP = 12;
const PANEL_PADDING = 20;
const DOT_RADIUS = 7;
const START_BUTTON_WIDTH = 260;

/**
 * The lobby, on its own screen: the room code to share, who's here, and
 * Start game for the host. Shown instead of the course while waiting.
 */
export class LobbyScreen {
    private readonly container: Phaser.GameObjects.Container;
    /** Rebuilt whenever the player list changes. */
    private readonly content: Phaser.GameObjects.Container;
    private readonly startButton: Button;
    private width = 0;
    private height = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly network: Network,
    ) {
        this.content = scene.add.container(0, 0);

        this.startButton = new Button(
            scene,
            0,
            0,
            "Start game",
            START_BUTTON_WIDTH,
        ).setOnClick(() => this.network.startGame());

        this.container = scene.add
            .container(0, 0, [this.content, this.startButton])
            .setVisible(false);
    }

    setVisible(visible: boolean) {
        this.container.setVisible(visible);

        if (visible) {
            this.update();
        }
    }

    get visible() {
        return this.container.visible;
    }

    /** Enter key: start the game, if we're the host. */
    trigger() {
        if (this.visible && this.startButton.visible) {
            this.startButton.trigger();
        }
    }

    layout(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.update();
    }

    /**
     * One card per course; the picked one is outlined in green. The host
     * can click another. Returns the height used.
     */
    private drawCourses(
        top: number,
        isHost: boolean,
        add: <T extends Phaser.GameObjects.GameObject>(object: T) => T,
    ) {
        const picked = this.network.getCourseId();
        const total =
            COURSES.length * COURSE_CARD_WIDTH +
            (COURSES.length - 1) * COURSE_CARD_GAP;
        const cards = add(this.scene.add.graphics());

        COURSES.forEach((course, index) => {
            const left = -total / 2 + index * (COURSE_CARD_WIDTH + COURSE_CARD_GAP);
            const isPicked = course.id === picked;

            drawPanel(cards, left, top, COURSE_CARD_WIDTH, COURSE_CARD_HEIGHT);

            if (isPicked) {
                cards.lineStyle(3, COLORS.fairway, 1);
                cards.strokeRoundedRect(left + 1.5, top + 1.5, COURSE_CARD_WIDTH - 3, COURSE_CARD_HEIGHT - 3, 14);
            }

            add(
                addText(this.scene, left + 18, top + 16, course.name, {
                    size: TYPE.label,
                    bold: true,
                    color: isPicked ? CSS.fairway : CSS.text,
                }),
            );

            add(
                addText(this.scene, left + 18, top + 47, course.description, {
                    size: TYPE.small,
                    color: CSS.muted,
                    wrap: COURSE_CARD_WIDTH - 36,
                }),
            );

            // Only the host can change it
            if (isHost && !isPicked) {
                add(
                    this.scene.add
                        .zone(left, top, COURSE_CARD_WIDTH, COURSE_CARD_HEIGHT)
                        .setOrigin(0, 0)
                        .setInteractive({ useHandCursor: true })
                        .on("pointerup", () => this.network.selectCourse(course.id)),
                );
            }
        });

        return COURSE_CARD_HEIGHT;
    }

    /** Redraw for the current players and host. */
    update() {
        if (!this.visible) {
            return;
        }

        this.content.removeAll(true);

        const players = this.network.getPlayers();
        const ownId = this.network.getPlayerId();
        const hostId = this.network.getHostId();
        const isHost = this.network.getIsHost();
        const add = <T extends Phaser.GameObjects.GameObject>(object: T) => {
            this.content.add(object);
            return object;
        };

        let y = 0;

        // The room code is the headline here: it's how friends get in
        const codeLabel = add(
            addText(this.scene, 0, y, "Room code", {
                size: TYPE.label,
                color: CSS.muted,
            }).setOrigin(0.5, 0),
        );
        y += codeLabel.height + 4;

        const code = add(
            addText(this.scene, 0, y, this.network.getLobbyCode(), {
                size: TYPE.display,
                bold: true,
            })
                .setOrigin(0.5, 0)
                .setLetterSpacing(14),
        );
        // Letter spacing also trails the last letter: shift back to centre
        code.x = 7;
        y += code.height + 24;

        // The course: the host picks, everyone sees the pick
        y += this.drawCourses(y, isHost, add) + 24;

        // Players, in columns of up to six
        const columns = Math.min(
            MAX_COLUMNS,
            Math.max(1, Math.ceil(players.length / ROWS_PER_COLUMN)),
        );
        const rows = Math.ceil(players.length / columns);
        const panelWidth =
            columns * COLUMN_WIDTH + (columns - 1) * COLUMN_GAP + PANEL_PADDING * 2;
        const left = -panelWidth / 2;

        const background = add(this.scene.add.graphics());

        const heading = add(
            addText(this.scene, left + PANEL_PADDING, y + PANEL_PADDING, "Players", {
                size: TYPE.label,
                bold: true,
            }),
        );
        add(
            addText(
                this.scene,
                left + panelWidth - PANEL_PADDING,
                y + PANEL_PADDING + 3,
                `${players.length}`,
                { size: TYPE.body, color: CSS.muted },
            ).setOrigin(1, 0),
        );

        const rowsTop = y + PANEL_PADDING + heading.height + 12;
        const panelHeight =
            rowsTop - y + rows * ROW_HEIGHT + PANEL_PADDING - 6;

        drawPanel(background, left, y, panelWidth, panelHeight);

        players.forEach((player, index) => {
            const column = Math.floor(index / rows);
            const row = index % rows;
            const rowLeft =
                left + PANEL_PADDING + column * (COLUMN_WIDTH + COLUMN_GAP);
            const rowTop = rowsTop + row * ROW_HEIGHT;
            const centerY = rowTop + ROW_HEIGHT / 2;
            const isOwn = player.id === ownId;

            // Your own row sits on a lighter band
            if (isOwn) {
                background.fillStyle(COLORS.panelHighlight, 1);
                background.fillRoundedRect(
                    rowLeft - 8,
                    rowTop + 2,
                    COLUMN_WIDTH + 16,
                    ROW_HEIGHT - 4,
                    10,
                );
            }

            background.fillStyle(player.color ?? 0xffffff, 1);
            background.fillCircle(rowLeft + DOT_RADIUS, centerY, DOT_RADIUS);

            // Reconnecting says more than Host while someone's away
            const tagText =
                player.connected === false
                    ? "Reconnecting"
                    : player.id === hostId
                      ? "Host"
                      : undefined;

            const tag =
                tagText !== undefined
                    ? add(
                          addText(
                              this.scene,
                              rowLeft + COLUMN_WIDTH,
                              centerY,
                              tagText,
                              { size: TYPE.small, color: CSS.muted },
                          ).setOrigin(1, 0.5),
                      )
                    : undefined;

            const nameX = rowLeft + DOT_RADIUS * 2 + 12;
            const name = add(
                addText(this.scene, nameX, centerY, player.name, {
                    size: TYPE.body,
                    bold: isOwn,
                }).setOrigin(0, 0.5),
            );

            // Keep long names clear of the Host tag
            const maxNameWidth =
                (tag ? tag.x - tag.width - 12 : rowLeft + COLUMN_WIDTH) - nameX;
            fitText(name, maxNameWidth);
        });

        y += panelHeight + 44;

        // The host starts; everyone else sees who they're waiting for
        this.startButton.setVisible(isHost).setPosition(0, y + 30);

        if (!isHost) {
            const host = players.find((player) => player.id === hostId);
            add(
                addText(
                    this.scene,
                    0,
                    y + 30,
                    `Waiting for ${host?.name ?? "the host"} to start`,
                    { size: TYPE.label, color: CSS.muted },
                ).setOrigin(0.5),
            );
        }

        y += 60;

        // Centred on screen as a whole
        this.container.setPosition(this.width / 2, (this.height - y) / 2);
    }
}
