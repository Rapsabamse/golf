import {
    BallLocation,
    GameState,
    MessageTypeClient,
    MessageTypeServer,
    Player,
    ServerData,
} from "../types/types";
import { broadcast, getPlayersList } from "../serverHelpers";
import { WebSocket } from "ws";
import Phaser from "phaser";

export function handleMessages(
    playerId: string,
    data: WebSocket.RawData,
    gameState: GameState,
    players: Map<string, Player>,
    setGamestate: (newGamestate: GameState) => void,
    getHostId: () => string | undefined,
    setBallLocations: (newBallLocations: BallLocation[]) => void,
    getBallLocations: () => BallLocation[],
    getScoringPlayers: () => string[],
    playersReady: Set<string>,
) {
    const message = JSON.parse(data.toString());

    if (message.type === MessageTypeClient.NAME) {
        const player = players.get(playerId);

        console.log(playerId, " set their name to: ", message.data);

        if (player) {
            player.name = message.data;
        }
    }

    //A client tries to start the game
    if (
        message.type === MessageTypeClient.START_GAME &&
        gameState === GameState.WAITING
    ) {
        console.log("Starting planning phase");

        if (gameState !== GameState.WAITING) {
            return;
        }

        setGamestate(GameState.PLANNING);

        players.forEach((player) => {
            player.roundState = {
                shots: 0,
                hasScored: false,
            };
            player.waitingForNextRound = false;
        });

        broadcast(
            {
                type: MessageTypeServer.GAME_STATE,
                data: { state: GameState.PLANNING },
            },
            players,
        );
    }

    //Client sends their last selected shot
    if (
        message.type === MessageTypeClient.SHOT_SELECTED &&
        gameState === GameState.PLANNING
    ) {
        const data: Phaser.Math.Vector2 = message.data;

        console.log(
            `Player ${playerId} has selected a new shot - X: ${data.x} Y: ${data.y}`,
        );

        let currentPlayer = players.get(playerId);
        if (currentPlayer) {
            currentPlayer!.shot = { direction: data };
            players.set(playerId, currentPlayer);
        }
    }

    //Client sets that they are ready
    if (
        message.type === MessageTypeClient.READY &&
        gameState === GameState.PLANNING
    ) {
        playersReady.add(playerId);

        const allPlayersReady = Array.from(players.values())
            .filter(
                (player) =>
                    !player.waitingForNextRound &&
                    !player.roundState?.hasScored,
            )
            .every((player) => playersReady.has(player.id));

        if (!allPlayersReady) {
            return;
        }

        playersReady.clear();

        if (allPlayersReady) {
            setGamestate(GameState.SIMULATING);

            const playerList = Array.from(players.values()).map((player) => ({
                id: player.id,
                shot: player.shot,
            }));

            broadcast(
                {
                    type: MessageTypeServer.GAME_STATE,
                    data: {
                        state: getHostId()
                            ? GameState.SIMULATING_HOST
                            : GameState.SIMULATING,
                        playerList: playerList,
                    } as ServerData,
                },
                players,
            );

            console.log("Sending simulation data to clients");

            // Increment shots for players who havent scored
            // Reset the shots for all players
            players.forEach((player) => {
                if (player.roundState && !player.roundState.hasScored) {
                    player.roundState!.shots += 1;
                }
                player.shot = undefined;
            });
        }
    }

    //Client says that they have completed the simulation of the last round
    if (
        message.type === MessageTypeClient.SIMULATION_DONE &&
        gameState === GameState.SIMULATING
    ) {
        if (playerId === getHostId()) {
            setBallLocations(message.data);

            setGamestate(GameState.PLANNING);

            console.log("broadcasting ball-locations");

            broadcast(
                {
                    type: MessageTypeServer.GAME_STATE,
                    data: {
                        state: GameState.PLANNING,
                        ballLocations: getBallLocations(),
                        scoringPlayers: getScoringPlayers(),
                    },
                },
                players,
            );
        }
    }

    //Client says that a player has went into the hole
    if (
        message.type === MessageTypeClient.PLAYER_GOAL &&
        gameState === GameState.SIMULATING
    ) {
        // Only listen to hosts simulated goals
        if (playerId != getHostId()) {
            return;
        }

        const scoringPlayer = players.get(message.data);
        if (scoringPlayer && scoringPlayer.roundState?.hasScored === false) {
            scoringPlayer.roundState!.hasScored = true;
            scoringPlayer.state!.points.push(scoringPlayer.roundState!.shots);

            console.log(
                "Player ",
                message.data,
                " Scored! Shots needed:",
                scoringPlayer.roundState.shots,
            );
        }

        let roundComplete = true;
        players.forEach((player) => {
            if (!player.waitingForNextRound) {
                if (roundComplete && !player.roundState?.hasScored) {
                    roundComplete = false;
                }
            }
        });

        //If all players have scored, start a new round
        if (roundComplete) {
            players.forEach((player) => {
                player.roundState = {
                    shots: 0,
                    hasScored: false,
                };
                player.waitingForNextRound = false;
            });

            /**
             * Send to clients that the round is complete.
             */
            broadcast(
                {
                    type: MessageTypeServer.GAME_STATE,
                    data: {
                        state: GameState.ROUND_COMPLETE,
                        playerData: players,
                        playerList: getPlayersList(players),
                    },
                },
                players,
            );

            setGamestate(GameState.ROUND_COMPLETE);
        }
    }

    //Client says that they have joined the new map
    if (
        message.type === MessageTypeClient.LOADED_NEW_MAP &&
        gameState === GameState.ROUND_COMPLETE
    ) {
        if (playerId === getHostId()) {
            /**
             * Send to clients that they can start planning their shots
             */
            broadcast(
                {
                    type: MessageTypeServer.GAME_STATE,
                    data: { state: GameState.PLANNING },
                },
                players,
            );

            setGamestate(GameState.PLANNING);
        }
    }
}
