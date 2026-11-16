import { ServerContext } from "../serverState";
import {
    broadcastPlayerList,
    getCurrentMapName,
    getScoringPlayers,
    pickColor,
} from "../gameLogic";
import { getPlayersList } from "../serverHelpers";
import {
    CourseState,
    GameState,
    MessageTypeServer,
    Player,
} from "../types/types";
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

    // Joining a game in progress: send where everyone's ball is, so the
    // new player can watch until the next hole
    const courseState: CourseState | undefined = shouldWait
        ? {
              players: getPlayersList(ctx.players).filter(
                  (other) => !other.waitingForNextRound,
              ),
              ballLocations: ctx.ballLocations,
              scoringPlayers: getScoringPlayers(ctx),
          }
        : undefined;

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
                courseState,
            },
        }),
    );

    // Send the updated player list to everyone
    broadcastPlayerList(ctx);
}
