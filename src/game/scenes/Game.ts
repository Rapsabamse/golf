import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { Player } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { GeneratedMap } from "../GameMaps/Type";
import { Scoreboard } from "../GameComponents/Scoreboard";
import { TiledMapLoader } from "../GameMaps/TileReader";
import { getBaseMap } from "../GameMaps/maps";
import { GameStateHandler } from "../handlers/GameStateHandler";
import { SoundEffects } from "../GameComponents/SoundEffects";

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
    private sounds = new SoundEffects();

    private scoredPlayers: string[] = [];

    constructor() {
        super("Game");
    }

    create(data: { playerName: string }) {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);
        this.camera.setZoom(0.6);

        this.network = new Network();

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
            this.sounds,
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

        // The interface lives in its own scene on top, so zooming the
        // course doesn't move or scale it. Connect once it exists.
        this.scene.launch("Hud");
        const hud = this.scene.get("Hud");

        hud.events.once(Phaser.Scenes.Events.CREATE, () => {
            this.createInterface(hud);
            this.network.connect(data.playerName);
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.stop("Hud");
        });

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

    private createInterface(hud: Phaser.Scene) {
        //Create UI
        this.ui = new GameUI(
            hud,
            this.network,
            () => this.lockIn(),
            () => this.haveIScored(),
            () => this.sounds.isMuted(),
        );

        // The aim arrow reports its charge to the power bar
        this.aimController.onChargeChange = (charge) =>
            this.ui.setCharge(charge);

        //Create the scoreboard
        this.scoreboard = new Scoreboard(hud);

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
            (map) => {
                this.currentMap = map;
            },
        );

        //Subscribe to playerListUpdates
        this.network.onPlayerList = (
            players: Player[],
            self: Player | undefined,
        ) => {
            if (this.network.isLobbyWaiting()) {
                this.ballManager.updateBalls(players, false);

                // Show the whole course while everyone gathers
                this.gameStateHandler.frameCourse();
            } else {
                // Mid-game: only remove the balls of players who left
                this.ballManager.removeMissingPlayers(players);
            }

            this.ui.updateUI(
                this.network.getGameState(),
                this.network.getIsHost(),
                self?.waitingForNextRound,
            );
        };

        //Handle when we get ready confirmation form server
        this.network.onReadyConfirmed = () => {
            this.sounds.lockIn();
            this.ui.setReady();
            this.aimController.updateCanInteract(false);
        };

        //Subscribe to gamestateUpdates
        this.network.onGameStateChange = (gamestate, data?) => {
            this.gameStateHandler.handle(gamestate, data);
        };

        // M toggles sound
        this.input.keyboard?.on("keydown-M", () => {
            this.sounds.toggleMute();
            this.ui.refreshPlayerPanel(this.network.getGameState());
        });

        // Enter runs the main action (Start game / Lock in shot)
        this.input.keyboard?.on("keydown-ENTER", () => {
            this.ui.triggerAction();
        });
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update() {
        this.ballManager.update();
    }

    lockIn() {
        // Locking in without aiming would waste a stroke
        if (!this.aimController.hasSelectedShot()) {
            this.ui.showHint("Aim first: drag back from your ball");
            return;
        }

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
