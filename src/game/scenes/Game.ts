import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { GameMap } from "../../type/GameTypes";
import { TestMap } from "../GameMaps/TestMap";
import { GameState, ServerData } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";

export class Game extends Phaser.Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;

    private network!: Network;
    private currentMap!: GameMap;
    private aimController!: AimController;
    private ballManager!: BallManager;
    private ui!: GameUI;

    constructor() {
        super("Game");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);
        this.camera.setZoom(0.75);

        this.network = new Network();
        this.network.connect();

        //Subscribe to playerListUpdates
        this.network.onPlayerList = (players) => {
            if (this.network.isLobbyWaiting()) {
                this.ballManager.updateBalls(players);

                //Kameran ska följa bollen
                const ownBall = this.ballManager.getOwnBall();
                if (ownBall) {
                    this.camera.startFollow(ownBall.visual);
                }
            }
        };

        //Subscribe to gamestateUpdates
        this.network.onGameStateChange = (gamestate, data?) => {
            this.ui.updateUI(gamestate);

            if (gamestate === GameState.PLANNING) {
                this.aimController.updateCanInteract(true);

                const recievedData: ServerData = data;
                if (recievedData.ballLocations) {
                    this.ballManager.updateBallLocations(
                        recievedData.ballLocations,
                    );
                }
            } else {
                this.aimController.updateCanInteract(false);
            }

            if (
                gamestate === GameState.SIMULATING ||
                gamestate === GameState.SIMULATING_HOST
            ) {
                const recievedData: ServerData = data;

                if (recievedData.playerList) {
                    this.aimController.clearAimline();

                    this.ballManager.simulateRound(
                        recievedData.playerList,
                        gamestate === GameState.SIMULATING_HOST,
                    );
                }
            }
        };

        //Create a map
        this.currentMap = new TestMap();
        this.currentMap.create(this);

        //Create the ball manager
        this.ballManager = new BallManager(
            this,
            this.currentMap,
            () => this.network.getPlayerId(),
            this.network,
        );

        //Create inputs
        this.aimController = new AimController(
            this,
            () => this.ballManager.getOwnBall(),
            this.network,
        );

        //Create UI
        this.ui = new GameUI(this, this.network, () => this.lockIn());

        EventBus.emit("current-scene-ready", this);
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update() {
        this.ballManager.update();
    }

    lockIn() {
        this.network.sendReady();
        this.aimController.updateCanInteract(false);
    }
}
