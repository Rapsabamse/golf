import { Boot } from "./scenes/Boot";
import { GameOver } from "./scenes/GameOver";
import { Game as MainGame } from "./scenes/Game";
import { MainMenu } from "./scenes/MainMenu";
import { AUTO, Game, Scale } from "phaser";
import { Preloader } from "./scenes/Preloader";
import { Hud } from "./scenes/Hud";
import { Backdrop } from "./scenes/Backdrop";
import { ACTIVE_FPS, startFramePacer } from "./GameHelpers/FramePacer";

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
    // No faster than this, even on high refresh rate screens; FramePacer
    // drops lower still when nothing is moving
    fps: {
        limit: ACTIVE_FPS,
    },
    // Backdrop is drawn first (the sky), Hud last (the interface)
    // (Only the Game scene has physics, set up in its constructor)
    scene: [Boot, Backdrop, Preloader, MainMenu, MainGame, Hud, GameOver],
};

const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    startFramePacer(game);
    return game;
};

export default StartGame;
