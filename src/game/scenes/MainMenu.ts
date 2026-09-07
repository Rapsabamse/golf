import { GameObjects, Scene } from "phaser";

import { EventBus } from "../EventBus";

export class MainMenu extends Scene {
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;
    joinButton: GameObjects.Text;

    logoTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.background = this.add.image(512, 384, "background").setScale(1.3);

        this.logo = this.add
            .image(640, 250, "logo")
            .setDepth(100)
            .setScale(0.45);

        this.createJoinButton();

        EventBus.emit("current-scene-ready", this);
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
        if (this.logoTween) {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start("Game");
    }
}

