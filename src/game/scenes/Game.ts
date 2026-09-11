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
import { GameStateHandler } from "../handlers/GameStateHandler";

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
    private gameStateHandler!: GameStateHandler;

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
            this.gameStateHandler.handle(gamestate, data);
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

        //Create the gamestateHandler
        this.gameStateHandler = new GameStateHandler(
            this,
            this.network,
            this.aimController,
            this.ballManager,
            this.ui,
            this.scoreboard,
            this.currentMap,
            () => this.haveIScored(),
            (players) => {
                this.scoredPlayers = players;
            },
            () => this.scoredPlayers,
            (map) => {
                this.currentMap = map;
            },
        );

        this.input //Add zoom feature
            .on(
                "wheel",
                (
                    _pointer: Phaser.Input.Pointer,
                    _gameObjects: Phaser.GameObjects.GameObject[],
                    _deltaX: number,
                    deltaY: number,
                ) => {
                    const zoomAmount = 0.1;

                    const targetZoom = Phaser.Math.Clamp(
                        this.camera.zoom - Math.sign(deltaY) * zoomAmount,
                        0.3,
                        1.0,
                    );

                    this.tweens.add({
                        targets: this.camera,
                        zoom: targetZoom,
                        duration: 150,
                        ease: "Sine.easeOut",
                    });
                },
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
