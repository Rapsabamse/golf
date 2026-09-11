import { sendPlayerList } from "../serverHelpers";
import { GameState, MessageTypeServer, Player } from "../types/types";
import { WebSocket } from "ws";

export function handleConnection(
    socket: WebSocket,
    players: Map<string, Player>,
    gameState: GameState,
    playerId: string,
    setHostId: (id: string) => void,
    getHostId: () => string | undefined,
) {
    const player: Player = {
        id: playerId,
        socket,
        state: { points: [] },
        waitingForNextRound: gameState != GameState.WAITING,
        name: "",
    };

    players.set(playerId, player);

    console.log(`Player connected: ${playerId}`);
    console.log(`Players: ${players.size}`);

    if (!getHostId()) {
        setHostId(playerId);
    }

    // Tell the client which ID belongs to them
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.CONNECTED,
            data: { playerId: playerId },
        }),
    );

    // Send the current game state to the client
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: gameState,
                isHost: getHostId() === playerId,
                shouldWait: gameState != GameState.WAITING,
            },
        }),
    );

    // Send the updated player list to everyone
    sendPlayerList(players, getHostId());
}
