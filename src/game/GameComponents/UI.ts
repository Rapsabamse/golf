import { GameState } from "../../../server/types/types";
import { Network } from "../Networking/Network";

export class GameUI {
    private gameStateBackground!: Phaser.GameObjects.Graphics;
    private gameStateTextTitle!: Phaser.GameObjects.Text;
    private gameStateTextSubtitle!: Phaser.GameObjects.Text;
    private gameStateButton!: Phaser.GameObjects.Text;

    constructor(
        private scene: Phaser.Scene,
        private network: Network,
        private lockIn: () => void,
        private haveIScored: () => boolean,
    ) {
        this.create();
    }

    private create() {
        this.gameStateBackground = this.scene.add.graphics().setScrollFactor(0);

        this.gameStateTextTitle = this.scene.add
            .text(20, 20, "", {
                fontSize: "36px",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setScrollFactor(0);

        this.gameStateTextSubtitle = this.scene.add
            .text(20, 60, "", {
                fontSize: "24px",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setScrollFactor(0);

        this.gameStateButton = this.scene.add
            .text(20, 120, "", {
                fontSize: "24px",
                color: "#ffffff",
                fontStyle: "bold",
                backgroundColor: "#333333",
                padding: {
                    left: 10,
                    right: 10,
                    top: 5,
                    bottom: 5,
                },
            })
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });

        this.gameStateButton.on("pointerover", () => {
            this.gameStateButton.setBackgroundColor("#555555");
        });

        this.gameStateButton.on("pointerout", () => {
            this.gameStateButton.setBackgroundColor("#333333");
        });

        this.gameStateButton.visible = false;
        this.gameStateBackground.visible = false;
    }

    updateUI(gameState: GameState) {
        switch (gameState) {
            case GameState.PLANNING:
                if (this.haveIScored()) {
                    this.gameStateTextTitle.setText("You have scored!");
                    this.gameStateTextSubtitle.setText(
                        "Please wait for all\nother players to score.",
                    );

                    this.gameStateButton.visible = false;
                } else {
                    this.gameStateTextTitle.setText("Planning");
                    this.gameStateTextSubtitle.setText("Plan your next shot");

                    this.gameStateButton
                        .setText("Lock In")
                        .removeAllListeners("pointerdown")
                        .on("pointerdown", () => this.lockIn());

                    this.gameStateButton.visible = true;
                }

                this.gameStateBackground.visible = true;

                this.resizeGameStateBackground();
                break;

            case GameState.SIMULATING:
            case GameState.SIMULATING_HOST:
                this.gameStateTextTitle.setText("");
                this.gameStateTextSubtitle.setText("");

                this.gameStateButton.visible = false;
                this.gameStateBackground.visible = false;
                break;

            case GameState.WAITING:
                this.gameStateTextTitle.setText("Waiting");
                this.gameStateTextSubtitle.setText(
                    "Waiting for players to join.\nPress start to start the game",
                );

                this.gameStateButton
                    .setText("Start Game")
                    .removeAllListeners("pointerdown")
                    .on("pointerdown", () => this.startGame());

                this.gameStateButton.visible = true;
                this.gameStateBackground.visible = true;

                this.resizeGameStateBackground();
                break;
        }
    }

    private resizeGameStateBackground() {
        const padding = 10;

        const titleBounds = this.gameStateTextTitle.getBounds();
        const subtitleBounds = this.gameStateTextSubtitle.getBounds();
        const buttonBounds = this.gameStateButton.getBounds();

        const left =
            Math.min(titleBounds.x, subtitleBounds.x, buttonBounds.x) - padding;

        const top =
            Math.min(titleBounds.y, subtitleBounds.y, buttonBounds.y) - padding;

        const right =
            Math.max(
                titleBounds.right,
                subtitleBounds.right,
                buttonBounds.right,
            ) + padding;

        const bottom =
            Math.max(
                titleBounds.bottom,
                subtitleBounds.bottom,
                buttonBounds.bottom,
            ) + padding;

        this.gameStateBackground.clear();
        this.gameStateBackground.fillStyle(0x000000, 0.5);
        this.gameStateBackground.fillRoundedRect(
            left,
            top,
            right - left,
            bottom - top,
            10,
        );
    }

    private startGame() {
        this.network.startGame();
    }
}
