import { GameObjects, Scene } from "phaser";

import { EventBus } from "../EventBus";
import { getRandomName } from "../GameHelpers/MenuHelpers";

export class MainMenu extends Scene {
    background: GameObjects.Image;
    logo: GameObjects.Text;
    joinButton: GameObjects.Text;

    private nameInput!: HTMLInputElement;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.background = this.add.image(512, 384, "background").setScale(1.3);

        this.logo = this.add
            .text(640, 300, "GOLF - golf", {
                fontSize: "64px",
                fontStyle: "bold",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 6,
                shadow: {
                    offsetX: 4,
                    offsetY: 4,
                    color: "#000000",
                    blur: 4,
                    fill: true,
                },
            })
            .setOrigin(0.5);

        this.createNameInput();
        this.createJoinButton();

        EventBus.emit("current-scene-ready", this);
    }

    private createNameInput() {
        this.nameInput = document.createElement("input");

        this.nameInput.type = "text";
        this.nameInput.placeholder = getRandomName();
        this.nameInput.maxLength = 16;

        Object.assign(this.nameInput.style, {
            position: "absolute",
            left: "50%",
            top: "55%",
            transform: "translate(-50%, -50%)",
            width: "300px",
            padding: "10px",
            fontSize: "24px",
            textAlign: "center",
        });

        document.body.appendChild(this.nameInput);
    }

    private createJoinButton() {
        this.joinButton = this.add
            .text(640, 500, "Join Game", {
                fontFamily: "Arial Black",
                fontSize: 32,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 8,
                align: "center",
            })
            .setOrigin(0.5)
            .setDepth(100)
            .setInteractive({ useHandCursor: true });

        this.joinButton.on("pointerover", () => {
            this.joinButton.setColor("#dddddd");
        });

        this.joinButton.on("pointerout", () => {
            this.joinButton.setColor("#ffffff");
        });

        this.joinButton.on("pointerdown", () => {
            this.changeScene();
        });
    }

    changeScene() {
        const name = this.nameInput.value.trim() || this.nameInput.placeholder;

        this.nameInput.remove();

        this.scene.start("Game", {
            playerName: name,
        });
    }
}
