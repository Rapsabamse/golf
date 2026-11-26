import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { GameState, Player } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { GeneratedMap } from "../GameMaps/Type";
import { ShotReplay } from "../GameComponents/ShotReplay";
import { Scoreboard } from "../GameComponents/Scoreboard";
import { TiledMapLoader } from "../GameMaps/TileReader";
import { getBaseMap } from "../GameMaps/maps";
import { GameStateHandler } from "../handlers/GameStateHandler";
import { SoundEffects } from "../GameComponents/SoundEffects";
import {
    applyUiScale,
    getViewScale,
    getWorldZoom,
    onResize,
} from "../ui/layout";
import { PLAY_ZOOM } from "../handlers/GameStateHandler";

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
        // Physics only here: the other scenes would otherwise each run an
        // empty physics world every frame
        super({
            key: "Game",
            physics: {
                default: "matter",
                matter: {
                    gravity: { x: 0, y: 0 },
                    debug: false,
                },
            },
        });
    }

    /** The menu hosts or joins a lobby, then hands over its connection. */
    create(data: { network: Network }) {
        this.camera = this.cameras.main;
        this.camera.setZoom(getWorldZoom(this, PLAY_ZOOM));

        this.network = data.network;

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
            // Everything is listening now: handle the lobby's messages
            this.network.resume();
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
                    // Zoom limits are relative to the window size, so every
                    // screen can zoom in and out by the same amount
                    const viewScale = getViewScale(this);
                    const zoomAmount = 0.1;

                    const targetZoom =
                        Phaser.Math.Clamp(
                            this.camera.zoom / viewScale -
                                Math.sign(deltaY) * zoomAmount,
                            0.3,
                            1.0,
                        ) * viewScale;

                    this.tweens.killTweensOf(this.camera);

                    this.tweens.add({
                        targets: this.camera,
                        zoom: targetZoom,
                        duration: 150,
                        ease: "Sine.easeOut",
                    });
                },
            );

        // Follow the window size
        let lastViewScale = getViewScale(this);

        onResize(this, () => {
            const viewScale = getViewScale(this);
            const ratio = viewScale / lastViewScale;
            lastViewScale = viewScale;

            this.tweens.killTweensOf(this.camera);

            if (this.gameStateHandler) {
                this.gameStateHandler.onViewResize(ratio);
            } else {
                this.camera.setZoom(this.camera.zoom * ratio);
            }
        });

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

        this.ui.onClockTick = () => this.sounds.clockTick();
        this.network.onConnectionLost = () => this.ui.showConnectionLost();

        // The aim arrow reports its charge to the power bar
        this.aimController.onChargeChange = (charge) =>
            this.ui.setCharge(charge);

        //Create the scoreboard
        this.scoreboard = new Scoreboard(hud);

        // Replays each hole's best putt before the scores
        const replay = new ShotReplay(this, hud, this.sounds);

        // Anchor the interface to the screen edges, now and on every resize
        const layoutInterface = () => {
            const { width, height } = applyUiScale(hud);
            this.ui.layout(width, height);
            this.scoreboard.layout(width, height);
            replay.layout(width, height);
        };

        layoutInterface();
        onResize(hud, layoutInterface);

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
            replay,
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

            // On the final scores, Play again follows the host
            if (this.network.getGameState() === GameState.GAME_OVER) {
                this.gameStateHandler.refreshFinalScores();
            }

            this.ui.updateUI(
                this.network.getGameState(),
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

        // Enter runs the main action (Start game / Lock in shot / Play again)
        this.input.keyboard?.on("keydown-ENTER", () => {
            if (this.network.getGameState() === GameState.GAME_OVER) {
                this.scoreboard.triggerPlayAgain();
            } else {
                this.ui.triggerAction();
            }
        });
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update() {
        this.currentMap.update();
        this.ballManager.update();
        this.ui?.update();
    }

    lockIn() {
        // Locking in without aiming would waste a stroke
        if (!this.aimController.hasSelectedShot()) {
            this.ui.showHint("Aim first");
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
