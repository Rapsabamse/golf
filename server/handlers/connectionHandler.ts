import { sendPlayerList } from "../serverHelpers";
import { GameState, MessageTypeServer, Player } from "../types/types";
import { WebSocket } from "ws";

export function handleConnection(
    socket: WebSocket,
    players: Map<string, Player>,
    gameState: GameState,
    playerId: string,
) {
    const player: Player = {
        id: playerId,
        socket,
        ready: false,
        state: { points: 0 },
    };

    players.set(playerId, player);

    console.log(`Player connected: ${playerId}`);
    console.log(`Players: ${players.size}`);

    // Tell the client which ID belongs to them
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.CONNECTED,
            playerId,
        }),
    );

    // Send the current game state to the client
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.GAME_STATE,
            state: gameState,
        }),
    );

    // Send the updated player list to everyone
    sendPlayerList(players);
}
