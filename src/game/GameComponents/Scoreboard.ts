import * as Phaser from "phaser";
import { Player } from "../../../server/types/types";

export class Scoreboard {
    private readonly container: Phaser.GameObjects.Container;

    constructor(private readonly scene: Phaser.Scene) {
        this.container = scene.add
            .container(640, 384)
            .setDepth(3000)
            .setScrollFactor(0);

        this.container.setVisible(false);
    }

    show(players: Player[]) {
        this.container.removeAll(true);
        this.container.setVisible(true);

        const sortedPlayers = [...players].sort((a, b) => {
            const scoreA =
                a.state?.points.reduce((sum, points) => sum + points, 0) ?? 0;

            const scoreB =
                b.state?.points.reduce((sum, points) => sum + points, 0) ?? 0;

            return scoreA - scoreB;
        });

        const rowHeight = 45;
        const headerHeight = 45;

        const titleY = -210;
        const headerY = -150;
        const startY = -105;

        const roundCount = Math.max(
            ...sortedPlayers.map((player) => player.state?.points.length ?? 0),
            0,
        );

        const nameWidth = 250;
        const roundWidth = 60;
        const totalColumnWidth = 80;

        const horizontalPadding = 50;

        // Calculate total width from the number of columns.
        const totalWidth =
            nameWidth +
            roundCount * roundWidth +
            totalColumnWidth +
            horizontalPadding;

        /*
         * Title
         */
        const title = this.scene.add
            .text(0, titleY, "Standings", {
                fontFamily: "Arial Black",
                fontSize: "36px",
                color: "#ffffff",
            })
            .setOrigin(0.5);

        this.container.add(title);

        /*
         * Header background
         */
        const headerBackground = this.scene.add
            .rectangle(0, headerY, totalWidth - 20, headerHeight, 0x333333, 1)
            .setOrigin(0.5);

        this.container.add(headerBackground);

        /*
         * Header text
         */
        const headerPlayer = this.scene.add
            .text(-totalWidth / 2 + 25, headerY, "Player", {
                fontFamily: "Arial",
                fontSize: "20px",
                fontStyle: "bold",
                color: "#ffffff",
            })
            .setOrigin(0, 0.5);

        this.container.add(headerPlayer);

        for (let round = 0; round < roundCount; round++) {
            const x = -totalWidth / 2 + nameWidth + round * roundWidth;

            const text = this.scene.add
                .text(x, headerY, `R${round + 1}`, {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    fontStyle: "bold",
                    color: "#ffffff",
                })
                .setOrigin(0.5);

            this.container.add(text);
        }

        const totalX =
            -totalWidth / 2 +
            nameWidth +
            roundCount * roundWidth +
            totalColumnWidth / 2;

        const totalHeader = this.scene.add
            .text(totalX, headerY, "Total", {
                fontFamily: "Arial",
                fontSize: "20px",
                fontStyle: "bold",
                color: "#ffffff",
            })
            .setOrigin(0.5);

        this.container.add(totalHeader);

        /*
         * Player rows
         */
        sortedPlayers.forEach((player, index) => {
            const y = startY + index * rowHeight;

            /*
             * Row background
             */
            const rowBackground = this.scene.add
                .rectangle(
                    0,
                    y,
                    totalWidth - 20,
                    rowHeight,
                    index % 2 === 0 ? 0x222222 : 0x181818,
                    1,
                )
                .setOrigin(0.5);

            this.container.add(rowBackground);

            const points = player.state?.points ?? [];

            const total = points.reduce((sum, score) => sum + score, 0);

            /*
             * Player name
             */
            const name = this.scene.add
                .text(-totalWidth / 2 + 25, y, player.name, {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    color: "#ffffff",
                })
                .setOrigin(0, 0.5);

            this.container.add(name);

            /*
             * Round scores
             */
            for (let round = 0; round < roundCount; round++) {
                const score = points[round] ?? "-";

                const scoreText = this.scene.add
                    .text(
                        -totalWidth / 2 + nameWidth + round * roundWidth,
                        y,
                        `${score}`,
                        {
                            fontFamily: "Arial",
                            fontSize: "20px",
                            color: "#ffffff",
                        },
                    )
                    .setOrigin(0.5);

                this.container.add(scoreText);
            }

            /*
             * Total score
             */
            const totalText = this.scene.add
                .text(totalX, y, `${total}`, {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    fontStyle: "bold",
                    color: "#ffffff",
                })
                .setOrigin(0.5);

            this.container.add(totalText);
        });
    }

    hide() {
        this.container.setVisible(false);
    }

    destroy() {
        this.container.destroy();
    }
}
