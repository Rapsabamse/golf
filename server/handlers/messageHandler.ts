import {
    GameState,
    MessageTypeClient,
    MessageTypeServer,
    Player,
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
                data: GameState.PLANNING,
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

            //Assume that all players are ready
            //If one player isnt ready this is set to false, and simulation wont begin
            let allPlayersReady = true;
            players.forEach((player) => {
                if (allPlayersReady) {
                    allPlayersReady = player.ready;
                }
            });

            if (allPlayersReady) {
                setGamestate(GameState.SIMULATING);

                broadcast(
                    {
                        type: MessageTypeServer.GAME_STATE,
                        data: GameState.SIMULATING,
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
        //Set that player has completed simulating.
        //If all players have completed simulation, change map and set gamemode to planning
    }
}
