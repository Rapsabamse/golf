import * as Phaser from "phaser";
import { GameState, Player, ServerData } from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { Scoreboard } from "../GameComponents/Scoreboard";
import { GeneratedMap } from "../GameMaps/Type";
import { TiledMapLoader } from "../GameMaps/TileReader";
import { getBaseMap, getNextMap } from "../GameMaps/maps";

export class GameStateHandler {
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly network: Network,
        private readonly aimController: AimController,
        private readonly ballManager: BallManager,
        private readonly ui: GameUI,
        private readonly scoreboard: Scoreboard,
        private currentMap: GeneratedMap,
        private readonly haveIScored: () => boolean,
        private readonly setScoredPlayers: (players: string[]) => void,
        private readonly getScoredPlayers: () => string[],
        private readonly setCurrentMap: (map: GeneratedMap) => void,
    ) {}

    handle(gamestate: GameState, data?: ServerData) {
        if (gamestate === GameState.WAITING) {
            this.handleWaiting();
        }

        if (gamestate === GameState.PLANNING) {
            this.handlePlanning(data);
        } else {
            this.aimController.updateCanInteract(false);
        }

        if (
            gamestate === GameState.SIMULATING ||
            gamestate === GameState.SIMULATING_HOST
        ) {
            this.handleSimulating(gamestate, data);
        }

        if (gamestate === GameState.ROUND_COMPLETE) {
            this.handleRoundComplete(data);
        }

        this.ui.updateUI(gamestate, this.network.getIsHost(), data?.shouldWait);
    }

    private handleWaiting() {
        this.setScoredPlayers([]);

        this.aimController.updateCanInteract(false);
        this.aimController.clearAimline();

        this.currentMap.destroy();

        const map = new TiledMapLoader().load(this.scene, getBaseMap());

        this.setCurrentMap(map);
        this.currentMap = map;

        this.ballManager.setMap(map);
        this.setupGoal();

        this.ballManager.updateBalls(this.network.getPlayers(), false);

        this.followOwnBall();

        this.ui.updateUI(GameState.WAITING, this.network.getIsHost(), false);
    }

    private handlePlanning(data?: ServerData) {
        if (!data) {
            return;
        }

        if (data.ballLocations) {
            this.ballManager.updateBallLocations(data.ballLocations);
        }

        if (data.scoringPlayers) {
            this.setScoredPlayers(data.scoringPlayers);
            this.ballManager.updateScoringPlayers();
        }

        this.aimController.updateCanInteract(!this.haveIScored());
    }

    private handleSimulating(gamestate: GameState, data?: ServerData) {
        if (!data?.playerList) {
            return;
        }

        this.aimController.clearAimline();

        this.ballManager.simulateRound(
            data.playerList,
            gamestate === GameState.SIMULATING_HOST,
        );
    }

    private handleRoundComplete(data?: ServerData) {
        if (!data?.playerList) {
            return;
        }

        this.setScoredPlayers([]);

        this.scoreboard.show(data.playerList);

        this.scene.time.delayedCall(5000, () => {
            this.scoreboard.hide();

            this.currentMap.destroy();

            const map = new TiledMapLoader().load(this.scene, getNextMap());

            this.setCurrentMap(map);
            this.currentMap = map;

            this.ballManager.setMap(map);
            this.ballManager.updateBalls(data.playerList!, true);

            this.setupGoal();
            this.followOwnBall();

            this.network.sendMapLoaded();
        });
    }

    private setupGoal() {
        this.currentMap.goal.setOnBallEntered((ballBody) => {
            this.ballManager.handleGoalReached(ballBody);
        });
    }

    private followOwnBall() {
        const ownBall = this.ballManager.getOwnBall();

        if (ownBall) {
            this.scene.cameras.main.startFollow(ownBall.visual);
        }
    }
}
