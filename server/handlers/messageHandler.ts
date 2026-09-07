import {
    BallLocation,
    GameState,
    MessageTypeClient,
    MessageTypeServer,
    Player,
    ServerData,
} from "../types/types";
import { broadcast } from "../serverHelpers";
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
) {
    const message = JSON.parse(data.toString());

    console.log(
        "Client message: ",
        MessageTypeClient[message.type],
        GameState[gameState],
    );

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
        let currentPlayer = players.get(playerId);
        if (currentPlayer) {
            currentPlayer.ready = true;
            players.set(playerId, currentPlayer);

            const allPlayersReady = Array.from(players.values()).every(
                (player) => player.ready,
            );

            if (allPlayersReady) {
                setGamestate(GameState.SIMULATING);

                const playerList = Array.from(players.values()).map(
                    (player) => ({
                        id: player.id,
                        shot: player.shot,
                    }),
                );

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
            }
        }
    }

    //Client says that they have completed the simulation of the last round
    if (
        message.type === MessageTypeClient.SIMULATION_DONE &&
        gameState === GameState.SIMULATING
    ) {
        let currentPlayer = players.get(playerId);
        if (currentPlayer) {
            currentPlayer.finishedSimulating = true;

            if (playerId === getHostId()) {
                setBallLocations(message.data);
            }

            const allPlayersFinished = Array.from(players.values()).every(
                (player) => player.finishedSimulating,
            );

            if (allPlayersFinished) {
                players.forEach((player) => {
                    player.ready = false;
                    player.finishedSimulating = false;
                });

                setGamestate(GameState.PLANNING);

                console.log("broadcasting balllocations");

                broadcast(
                    {
                        type: MessageTypeServer.GAME_STATE,
                        data: {
                            state: GameState.PLANNING,
                            ballLocations: getBallLocations(),
                        },
                    },
                    players,
                );
            }
        }
    }

    //Client says that they have completed the simulation of the last round
    if (
        message.type === MessageTypeClient.PLAYER_GOAL &&
        gameState === GameState.SIMULATING
    ) {
        let currentPlayer = players.get(playerId);

        // Only listen to hosts simulated goals
        if (currentPlayer?.id != getHostId()) {
            return;
        }

        console.log("Player ", message.data, " Scored!");
    }
}
