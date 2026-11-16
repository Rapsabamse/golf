import { Boot } from "./scenes/Boot";
import { GameOver } from "./scenes/GameOver";
import { Game as MainGame } from "./scenes/Game";
import { MainMenu } from "./scenes/MainMenu";
import { AUTO, Game, Scale } from "phaser";
import { Preloader } from "./scenes/Preloader";
import { Hud } from "./scenes/Hud";
import { Backdrop } from "./scenes/Backdrop";

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: "game-container",
    // Fill the browser window and follow it when it changes size; scenes
    // re-anchor their interface (see ui/layout.ts)
    scale: {
        mode: Scale.RESIZE,
        width: "100%",
        height: "100%",
    },
    backgroundColor: "#060917",
    // Backdrop is drawn first (the sky), Hud last (the interface)
    scene: [Boot, Backdrop, Preloader, MainMenu, MainGame, Hud, GameOver],

    physics: {
        default: "matter",
        matter: {
            gravity: {
                x: 0,
                y: 0,
            },
            debug: false,
        },
    },
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
