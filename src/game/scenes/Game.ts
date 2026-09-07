import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { GameState, ServerData } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { GeneratedMap, MapGenerator } from "../GameMaps/MapGenerator";
import { tmpMap } from "../GameMaps/map_1";

export class Game extends Phaser.Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;

    private network!: Network;
    private currentMap!: GeneratedMap;
    private aimController!: AimController;
    private ballManager!: BallManager;
    private ui!: GameUI;

    private scoredPlayers: string[] = [];

    constructor() {
        super("Game");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);
        this.camera.setZoom(0.6);

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
                const recievedData: ServerData = data;
                if (recievedData.ballLocations) {
                    this.ballManager.updateBallLocations(
                        recievedData.ballLocations,
                    );
                }

                if (recievedData.scoringPlayers) {
                    this.scoredPlayers = recievedData.scoringPlayers;
                    this.ballManager.updateScoringPlayers();
                    this.ui.updateUI(gamestate);
                }

                this.aimController.updateCanInteract(!this.haveIScored());
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

        // Create map
        const mapGenerator = new MapGenerator(25);
        this.currentMap = mapGenerator.generate(this, tmpMap);

        //Create the ball manager
        this.ballManager = new BallManager(
            this,
            this.currentMap,
            () => this.network.getPlayerId(),
            this.network,
            () => this.getScoringPlayers(),
        );

        //Connect the ball entered goal event with hadleGoalReached on the ballmanager
        this.currentMap.goal.setOnBallEntered((ballBody) => {
            this.ballManager.handleGoalReached(ballBody);
        });

        //Create inputs
        this.aimController = new AimController(
            this,
            () => this.ballManager.getOwnBall(),
            this.network,
        );

        //Create UI
        this.ui = new GameUI(
            this,
            this.network,
            () => this.lockIn(),
            () => this.haveIScored(),
        );

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

    haveIScored() {
        return this.scoredPlayers.includes(this.network.getPlayerId());
    }

    private getScoringPlayers() {
        return this.scoredPlayers;
    }
}
