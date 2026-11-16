import { ServerContext } from "../serverState";
import {
    broadcastPlayerList,
    getCurrentMapName,
    pickColor,
} from "../gameLogic";
import { GameState, MessageTypeServer, Player } from "../types/types";
import { WebSocket } from "ws";

export function handleConnection(
    socket: WebSocket,
    playerId: string,
    ctx: ServerContext,
) {
    const shouldWait = ctx.gameState !== GameState.WAITING;

    const player: Player = {
        id: playerId,
        socket,
        state: { points: [] },
        waitingForNextRound: shouldWait,
        name: "Player",
        color: pickColor(ctx),
    };

    ctx.players.set(playerId, player);

    console.log(`Player connected: ${playerId}`);
    console.log(`Players: ${ctx.players.size}`);

    if (!ctx.hostId) {
        ctx.hostId = playerId;
    }

    // Tell the client which ID belongs to them
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.CONNECTED,
            data: { playerId: playerId },
        }),
    );

    // Send the current game state and map to the client
    socket.send(
        JSON.stringify({
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: ctx.gameState,
                isHost: ctx.hostId === playerId,
                shouldWait,
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
            },
        }),
    );

    // Send the updated player list to everyone
    broadcastPlayerList(ctx);
}
