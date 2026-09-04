import { useEffect, useRef, useState } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Game } from "./game/scenes/Game";
import { EventBus } from "./game/EventBus";

function App() {
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    useEffect(() => {
        const handleSceneReady = (scene: Phaser.Scene) => {};

        EventBus.on("current-scene-ready", handleSceneReady);

        return () => {
            EventBus.removeListener("current-scene-ready", handleSceneReady);
        };
    }, []);

    // const changeScene = () => {
    //     if (phaserRef.current) {
    //         const scene = phaserRef.current.scene as MainMenu;

    //         if (scene) {
    //             scene.changeScene();
    //         }
    //     }
    // };

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        //setCanMoveSprite(scene.scene.key !== "MainMenu");
    };

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
        </div>
    );
}

export default App;
