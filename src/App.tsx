import { useEffect, useRef, useState } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { MainMenu } from "./game/scenes/MainMenu";
import { Game } from "./game/scenes/Game";
import { EventBus } from "./game/EventBus";

function App() {
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    const [game, setGame] = useState<Game | null>(null);
    const [isGameScene, setIsGameScene] = useState(false);

    useEffect(() => {
        const handleSceneReady = (scene: Phaser.Scene) => {
            setIsGameScene(scene.scene.key === "Game");

            if (scene.scene.key === "Game") {
                setGame(scene as Game);
            } else {
                setGame(null);
            }
        };

        EventBus.on("current-scene-ready", handleSceneReady);

        return () => {
            EventBus.removeListener("current-scene-ready", handleSceneReady);
        };
    }, []);

    const changeScene = () => {
        if (phaserRef.current) {
            const scene = phaserRef.current.scene as MainMenu;

            if (scene) {
                scene.changeScene();
            }
        }
    };

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        //setCanMoveSprite(scene.scene.key !== "MainMenu");
    };

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            <div>
                <div>
                    <button className="button" onClick={changeScene}>
                        Join game
                    </button>
                    {isGameScene && game != null && (
                        <button
                            className="button"
                            onClick={() => game?.startGame()}
                        >
                            Start Game
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
