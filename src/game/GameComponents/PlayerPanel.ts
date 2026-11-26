import * as Phaser from "phaser";
import { GameState, Player } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { COLORS, CSS, MARGIN, TYPE, addText, fitText, drawPanel } from "../ui/theme";

const WIDTH = 300;
const PADDING = 18;
const ROW_HEIGHT = 36;
const DOT_RADIUS = 7;

/**
 * Players in the top-right corner while aiming: who has locked in, who is
 * still aiming and who has holed out. (The lobby screen lists the lobby.)
 */
export class PlayerPanel {
    private readonly container: Phaser.GameObjects.Container;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly network: Network,
    ) {
        this.container = scene.add
            .container(0, MARGIN)
            .setVisible(false);
    }

    /** Keep the panel in the top-right corner of a screen this wide. */
    setScreenWidth(width: number) {
        this.container.x = width - MARGIN - WIDTH;
    }

    update(gameState: GameState) {
        // In the lobby, the lobby screen lists the players
        const shown = gameState === GameState.PLANNING;

        this.container.setVisible(shown);

        if (!shown) {
            return;
        }

        this.container.removeAll(true);

        const players = this.network.getPlayers();
        const ownId = this.network.getPlayerId();

        const background = this.scene.add.graphics();
        this.container.add(background);

        // Header
        let y = PADDING;

        const heading = addText(this.scene, PADDING, y, "Players", {
            size: TYPE.label,
            bold: true,
        });
        this.container.add(heading);

        // Only players who are here can lock in
        const shooters = players.filter(
            (player) =>
                !player.waitingForNextRound &&
                !player.roundState?.hasScored &&
                player.connected !== false,
        );
        const ready = shooters.filter((player) => player.ready).length;

        const summary = addText(
            this.scene,
            WIDTH - PADDING,
            y + 3,
            `${ready} of ${shooters.length} ready`,
            { size: TYPE.small, color: CSS.muted },
        ).setOrigin(1, 0);

        this.container.add(summary);

        y += heading.height + 10;

        // Rows
        let ownRowY: number | undefined;

        for (const player of players) {
            const isOwn = player.id === ownId;
            const centerY = y + ROW_HEIGHT / 2;

            if (isOwn) {
                ownRowY = y;
            }

            const dot = this.scene.add.graphics();
            dot.fillStyle(player.color ?? 0xffffff, 1);
            dot.fillCircle(PADDING + DOT_RADIUS, centerY, DOT_RADIUS);
            this.container.add(dot);

            const { text, color } = this.getPlanningStatus(player);

            const status = addText(this.scene, WIDTH - PADDING, centerY, text, {
                size: TYPE.small,
                bold: color === CSS.fairway,
                color,
            }).setOrigin(1, 0.5);

            const nameX = PADDING + DOT_RADIUS * 2 + 12;
            const name = addText(this.scene, nameX, centerY, player.name, {
                size: TYPE.body,
                bold: isOwn,
            }).setOrigin(0, 0.5);

            // Keep long names clear of the status
            const maxNameWidth = status.x - status.width - 12 - nameX;
            fitText(name, maxNameWidth);

            this.container.add([name, status]);

            y += ROW_HEIGHT;
        }

        y += PADDING - 6;

        drawPanel(background, 0, 0, WIDTH, y);

        // Your own row sits on a lighter band
        if (ownRowY !== undefined) {
            background.fillStyle(COLORS.panelHighlight, 1);
            background.fillRoundedRect(
                PADDING / 2,
                ownRowY,
                WIDTH - PADDING,
                ROW_HEIGHT,
                10,
            );
        }
    }

    private getPlanningStatus(player: Player) {
        // Their connection dropped; their place is held for them
        if (player.connected === false) {
            return { text: "Reconnecting", color: CSS.muted };
        }

        if (player.waitingForNextRound) {
            return { text: "Next hole", color: CSS.muted };
        }

        if (player.roundState?.hasScored) {
            return {
                text: `Holed in ${player.roundState.shots}`,
                color: CSS.text,
            };
        }

        return player.ready
            ? { text: "Ready", color: CSS.fairway }
            : { text: "Aiming", color: CSS.muted };
    }
}
