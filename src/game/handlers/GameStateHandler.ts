import * as Phaser from "phaser";
import {
    CourseState,
    GameState,
    Player,
    ServerData,
} from "../../../server/types/types";
import { Network } from "../Networking/Network";
import { AimController } from "../GameComponents/Controller";
import { BallManager } from "../GameComponents/BallManager";
import { GameUI } from "../GameComponents/UI";
import { Scoreboard } from "../GameComponents/Scoreboard";
import { GeneratedMap } from "../GameMaps/Type";
import { TiledMapLoader } from "../GameMaps/TileReader";
import { getBaseMap } from "../GameMaps/maps";
import { getUiScale, getWorldZoom } from "../ui/layout";

const SCOREBOARD_DURATION_MS = 5000;

/** Camera zoom while playing, at the 1280×720 design size (players can change it with the wheel). */
export const PLAY_ZOOM = 0.6;
/** Screen space the interface covers at the top and bottom (at the design size). */
const HUD_TOP = 180;
const HUD_BOTTOM = 110;
const FRAME_MARGIN = 60;

export class GameStateHandler {
    private currentMapName = getBaseMap();

    /** True while the camera shows the whole course instead of following a ball. */
    private framingCourse = false;

    private finalPlayers: Player[] = [];

    /** The map switch scheduled after the scoreboard, if one is pending. */
    private pendingMapLoad?: {
        timer: Phaser.Time.TimerEvent;
        run: () => void;
    };

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
        private readonly setCurrentMap: (map: GeneratedMap) => void,
    ) {}

    handle(gamestate: GameState, data?: ServerData) {
        // The lobby screen replaces the course while waiting
        this.scene.cameras.main.setVisible(gamestate !== GameState.WAITING);

        if (gamestate === GameState.WAITING) {
            // Game was reset: drop the scheduled switch to the next hole
            this.finishPendingMapLoad(false);
        } else if (gamestate !== GameState.ROUND_COMPLETE) {
            // The next round started before our scoreboard timer ran out
            this.finishPendingMapLoad(true);
        }

        if (gamestate !== GameState.PLANNING) {
            this.aimController.updateCanInteract(false);
            this.aimController.resetShot();
        }

        if (data?.hole !== undefined && gamestate !== GameState.ROUND_COMPLETE) {
            this.ui.setHole(data.hole);
        }

        // Keeps late joiners on the same hole as everyone else (someone who
        // joins during the scoreboard goes straight to the next hole's map)
        if (
            data?.mapName &&
            gamestate !== GameState.WAITING &&
            (gamestate !== GameState.ROUND_COMPLETE || data.courseState)
        ) {
            this.ensureMap(data.mapName);
        }

        // Joined a game in progress: put everyone's ball where it is now
        if (data?.courseState) {
            this.showCourseState(data.courseState);
        }

        // A new shot: whatever this screen was still simulating is replaced
        // by the host's result, and windmills and sliding blocks go to where
        // the host's shot left them (every screen starts the next shot from
        // the same place)
        if (gamestate === GameState.PLANNING) {
            this.ballManager.endSimulation();
        }

        if (data?.courseTime !== undefined) {
            this.currentMap.features.setTime(data.courseTime);
        }

        switch (gamestate) {
            case GameState.WAITING:
                this.handleWaiting(data);
                break;

            case GameState.PLANNING:
                this.handlePlanning(data);
                break;

            case GameState.SIMULATING:
            case GameState.SIMULATING_HOST:
                this.handleSimulating(data);
                break;

            case GameState.ROUND_COMPLETE:
                this.handleRoundComplete(data);
                break;

            case GameState.GAME_OVER:
                this.handleGameOver(data);
                break;
        }

        this.ui.updateUI(gamestate, data?.shouldWait);

        // Each new shot comes with the time left to take it
        this.ui.setShotClock(
            gamestate === GameState.PLANNING ? data?.shotClockMs : undefined,
        );
    }

    private showCourseState(courseState: CourseState) {
        // Same spawn order as everyone else used at the start of the hole
        this.ballManager.updateBalls(courseState.players, true);

        // Then move them to where they stopped after the last shot
        this.ballManager.updateBallLocations(courseState.ballLocations);

        this.setScoredPlayers(courseState.scoringPlayers);
        this.ballManager.updateScoringPlayers();

        this.frameCourse();
    }

    private handleWaiting(data?: ServerData) {
        this.setScoredPlayers([]);
        this.scoreboard.hide();

        this.aimController.clearAimline();

        this.ensureMap(data?.mapName ?? getBaseMap());

        // Recreate the balls so ones that were holed out become visible again
        this.ballManager.updateBalls(this.network.getPlayers(), true);

        this.frameCourse();
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

        this.aimController.updateCanInteract(
            !this.haveIScored() && !data.shouldWait,
        );

        // Watching from the sidelines: show the whole course. Playing:
        // follow your ball.
        if (data.shouldWait) {
            this.frameCourse();
        } else if (this.framingCourse) {
            this.playCamera();
        }
    }

    private handleSimulating(data?: ServerData) {
        if (!data?.playerList) {
            return;
        }

        this.ballManager.simulateRound(data.playerList);
    }

    private handleRoundComplete(data?: ServerData) {
        if (!data?.playerList) {
            return;
        }

        const playerList: Player[] = data.playerList;
        const nextMap = data.mapName ?? this.currentMapName;
        const nextHole = data.hole;

        this.setScoredPlayers([]);
        this.scoreboard.show(
            playerList,
            this.network.getPlayerId(),
            SCOREBOARD_DURATION_MS,
        );

        const run = () => {
            this.scoreboard.hide();
            this.ui.setHole(nextHole);

            this.loadMap(nextMap);
            this.ballManager.updateBalls(playerList, true);
            this.playCamera();

            this.network.sendMapLoaded();
        };

        this.finishPendingMapLoad(false);

        const timer = this.scene.time.delayedCall(SCOREBOARD_DURATION_MS, () => {
            this.pendingMapLoad = undefined;
            run();
        });

        this.pendingMapLoad = { timer, run };
    }

    private handleGameOver(data?: ServerData) {
        if (!data?.playerList) {
            return;
        }

        this.setScoredPlayers([]);
        this.showFinalScores(data.playerList);
    }

    /** Final scores, with Play again for whoever is host right now. */
    showFinalScores(players: Player[] = this.finalPlayers) {
        this.finalPlayers = players;

        const host = this.network
            .getPlayers()
            .find((player) => player.id === this.network.getHostId());

        this.scoreboard.showFinal(
            players,
            this.network.getPlayerId(),
            this.network.getIsHost(),
            host?.name ?? "the host",
            () => this.network.playAgain(),
        );
    }

    /** The player list changed on the final scores: the host may have left. */
    refreshFinalScores() {
        const host = this.network
            .getPlayers()
            .find((player) => player.id === this.network.getHostId());

        this.scoreboard.updateHost(
            this.network.getIsHost(),
            host?.name ?? "the host",
        );
    }

    /** Cancel the pending map switch, optionally doing it right away. */
    private finishPendingMapLoad(runNow: boolean) {
        const pending = this.pendingMapLoad;
        if (!pending) {
            return;
        }

        this.pendingMapLoad = undefined;
        this.scene.time.removeEvent(pending.timer);

        if (runNow) {
            pending.run();
        }
    }

    private ensureMap(mapName: string) {
        if (mapName !== this.currentMapName) {
            this.loadMap(mapName);
        }
    }

    private loadMap(mapName: string) {
        this.currentMap.destroy();

        const map = new TiledMapLoader().load(this.scene, mapName);

        this.setCurrentMap(map);
        this.currentMap = map;
        this.currentMapName = mapName;

        this.ballManager.setMap(map);
    }

    /**
     * Show the whole course in the space between the interface panels.
     * Used in the lobby and while waiting to join.
     */
    frameCourse() {
        const camera = this.scene.cameras.main;
        const bounds = this.currentMap.bounds;

        // The interface grows with the window, and so does the space it covers
        const uiScale = getUiScale(this.scene);
        const hudTop = HUD_TOP * uiScale;
        const hudBottom = HUD_BOTTOM * uiScale;
        const margin = FRAME_MARGIN * uiScale;

        const availableWidth = camera.width - margin * 2;
        const availableHeight = camera.height - hudTop - hudBottom - margin;

        const zoom = Phaser.Math.Clamp(
            Math.min(
                availableWidth / bounds.width,
                availableHeight / bounds.height,
            ),
            // Further out than the mouse wheel allows, so big holes still fit
            getWorldZoom(this.scene, 0.15),
            getWorldZoom(this.scene, 1),
        );

        // Centre the course in the free area, not the whole screen
        const freeCenterY = hudTop + availableHeight / 2 + margin / 2;
        const offsetY = (freeCenterY - camera.height / 2) / zoom;

        camera.stopFollow();
        camera.setZoom(zoom);
        camera.centerOn(bounds.centerX, bounds.centerY - offsetY);

        this.framingCourse = true;
    }

    /**
     * The window changed size. `ratio` is how much the view scale changed;
     * the camera keeps showing the same part of the course.
     */
    onViewResize(ratio: number) {
        const camera = this.scene.cameras.main;

        if (this.framingCourse) {
            this.frameCourse();
        } else {
            camera.setZoom(camera.zoom * ratio);
        }
    }

    /** Back to the playing view: normal zoom, following your ball. */
    private playCamera() {
        if (this.framingCourse) {
            this.scene.cameras.main.setZoom(
                getWorldZoom(this.scene, PLAY_ZOOM),
            );
            this.framingCourse = false;
        }

        this.followOwnBall();
    }

    private followOwnBall() {
        const ownBall = this.ballManager.getOwnBall();

        if (ownBall) {
            this.scene.cameras.main.startFollow(ownBall.visual);
        }
    }
}
