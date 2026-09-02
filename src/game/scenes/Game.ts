import * as Phaser from "phaser";
import { EventBus } from "../EventBus";
import { Network } from "../Networking/Network";
import { GameMap } from "../../type/GameTypes";
import { TestMap } from "../GameMaps/TestMap";
import { GameStates, Player } from "../../../server/types/types";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";

export class Game extends Phaser.Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;

    private balls = new Map<
        string,
        {
            visual: Phaser.GameObjects.Arc;
            body: MatterJS.BodyType;
        }
    >();

    private network!: Network;
    private currentMap!: GameMap;
    private aimController!: AimController;
    private ballManager!: BallManager;

    constructor() {
        super("Game");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);

        this.network = new Network();
        this.network.connect();

        //Subscribe to playerListUpdates
        this.network.onPlayerList = (players) => {
            if (this.network.isLobbyWaiting()) {
                this.ballManager.updateBalls(players);
            }
        };

        //Subscribe to gamestateUpdates
        this.network.onGameStateChange = (gamestate) => {
            if (gamestate === GameStates.PLANNING) {
                this.aimController.updateCanInteract(true);
            } else {
                this.aimController.updateCanInteract(false);
            }
        };

        //Create a map
        this.currentMap = new TestMap();
        this.currentMap.create(this);

        //Create the ball manager
        this.ballManager = new BallManager(this, this.currentMap, () =>
            this.network.getPlayerId(),
        );

        //Create inputs
        this.aimController = new AimController(this, () =>
            this.ballManager.getOwnBall(),
        );

        EventBus.emit("current-scene-ready", this);
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update() {
        this.ballManager.update();
    }

    public startGame() {
        this.network.startGame();
    }
}

