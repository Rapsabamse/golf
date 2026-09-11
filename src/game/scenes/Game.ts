import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { GameState, Player, ServerData } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { GeneratedMap } from "../GameMaps/Type";
import { Scoreboard } from "../GameComponents/Scoreboard";
import { TiledMapLoader } from "../GameMaps/TileReader";
import { getBaseMap, getNextMap } from "../GameMaps/maps";

export class Game extends Phaser.Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;

    private network!: Network;
    private currentMap!: GeneratedMap;
    private aimController!: AimController;
    private ballManager!: BallManager;
    private ui!: GameUI;
    private scoreboard!: Scoreboard;

    private scoredPlayers: string[] = [];

    constructor() {
        super("Game");
    }

    create(data: { playerName: string }) {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);
        this.camera.setZoom(0.6);

        this.network = new Network();
        this.network.connect(data.playerName);

        //Subscribe to playerListUpdates
        this.network.onPlayerList = (
            players: Player[],
            self: Player | undefined,
        ) => {
            if (this.network.isLobbyWaiting()) {
                this.ballManager.updateBalls(players, false);

                //Kameran ska följa bollen
                const ownBall = this.ballManager.getOwnBall();
                if (ownBall) {
                    this.camera.startFollow(ownBall.visual);
                }
            }

            this.ui.updateUI(
                this.network.getGameState(),
                this.network.getIsHost(),
                self?.waitingForNextRound,
            );
        };

        //Handle when we get ready confirmation form server
        this.network.onReadyConfirmed = () => {
            this.ui.setReady();
        };

        //Subscribe to gamestateUpdates
        this.network.onGameStateChange = (gamestate, data?) => {
            if (gamestate === GameState.WAITING) {
                this.resetGame();
            }

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

            if (gamestate === GameState.ROUND_COMPLETE) {
                const recievedData: ServerData = data;

                //Resetta vilka som har gjort mål
                this.scoredPlayers = [];

                this.scoreboard.show(recievedData.playerList!);

                this.time.delayedCall(5000, () => {
                    this.scoreboard.hide();

                    //Destroy the old map and generate a new one
                    this.currentMap.destroy();

                    this.currentMap = new TiledMapLoader().load(
                        this,
                        getNextMap(),
                    );

                    this.ballManager.setMap(this.currentMap);
                    this.ballManager.updateBalls(
                        recievedData.playerList!,
                        true,
                    );

                    this.currentMap.goal.setOnBallEntered((ballBody) => {
                        this.ballManager.handleGoalReached(ballBody);
                    });

                    //Kameran ska följa bollen
                    const ownBall = this.ballManager.getOwnBall();
                    if (ownBall) {
                        this.camera.startFollow(ownBall.visual);
                    }

                    //Tell the server that we have created the new map
                    this.network.sendMapLoaded();
                });
            }

            this.ui.updateUI(
                gamestate,
                this.network.getIsHost(),
                data.shouldWait,
            );
        };

        // Create map
        const mapLoader = new TiledMapLoader();
        this.currentMap = mapLoader.load(this, getBaseMap());

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

        //Create the scoreboard
        this.scoreboard = new Scoreboard(this);

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

    private resetGame() {
        this.scoredPlayers = [];

        this.aimController.updateCanInteract(false);
        this.aimController.clearAimline();

        this.currentMap.destroy();

        this.currentMap = new TiledMapLoader().load(this, getBaseMap());

        this.ballManager.setMap(this.currentMap);

        this.currentMap.goal.setOnBallEntered((ballBody) => {
            this.ballManager.handleGoalReached(ballBody);
        });

        this.ballManager.updateBalls(this.network.getPlayers(), false);

        const ownBall = this.ballManager.getOwnBall();

        if (ownBall) {
            this.camera.startFollow(ownBall.visual);
        }

        this.ui.updateUI(GameState.WAITING, this.network.getIsHost(), false);
    }
}
