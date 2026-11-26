import { randomUUID } from "crypto";
import { ServerContext } from "../serverState";
import {
    broadcastPlayerList,
    fillMissedHoles,
    finishMapLoad,
    getCurrentMapName,
    getScoringPlayers,
    getShotClockMs,
    isConnected,
    pickColor,
    startShotClockIfLockedIn,
} from "../gameLogic";
import { broadcastSingle, getPlayersList } from "../serverHelpers";
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
    name = "Player",
    catchphrase?: string,
) {
    const shouldWait = ctx.gameState !== GameState.WAITING;

    const player: Player = {
        id: playerId,
        socket,
        connected: true,
        rejoinToken: randomUUID(),
        state: { points: [] },
        waitingForNextRound: shouldWait,
        name,
        catchphrase,
        color: pickColor(ctx),
    };

    // Joining mid-game: take the worst score of each hole already finished.
    // (After the last hole the game is over and every hole is finished.)
    fillMissedHoles(
        ctx,
        player,
        ctx.gameState === GameState.GAME_OVER
            ? ctx.holeIndex + 1
            : ctx.gameState === GameState.WAITING
              ? 0
              : ctx.holeIndex,
    );

    ctx.players.set(playerId, player);

    console.log(`Player connected: ${playerId}`);
    console.log(`Players: ${ctx.players.size}`);

    if (!ctx.hostId) {
        ctx.hostId = playerId;
    }

    sendWelcome(ctx, player);

    // Send the updated player list to everyone
    broadcastPlayerList(ctx);
}

/**
 * A player whose connection dropped is back (they refreshed, or reopened
 * the tab): they carry on as themselves, with their ball and scores.
 */
export function handleRejoin(
    socket: WebSocket,
    ctx: ServerContext,
    player: Player,
) {
    clearTimeout(player.removeTimer);
    player.removeTimer = undefined;

    // Rejoining from a second tab: the newer one takes over
    if (player.socket && player.socket !== socket) {
        player.socket.close();
    }

    player.socket = socket;
    player.connected = true;

    console.log(`Player ${player.id} rejoined lobby ${ctx.code}`);

    // Nobody else was here to be host: they are again
    const host = ctx.hostId ? ctx.players.get(ctx.hostId) : undefined;
    const becameHost = !host || (host !== player && !isConnected(host));
    if (becameHost) {
        ctx.hostId = player.id;
    }
    const isHost = ctx.hostId === player.id;

    // The clock stopped while nobody was here to shoot (it carries on if
    // someone had already locked in)
    startShotClockIfLockedIn(ctx);

    sendWelcome(ctx, player);

    // They'd already locked in this shot before they dropped
    if (ctx.playersReady.has(player.id)) {
        broadcastSingle(
            { type: MessageTypeServer.SHOT_SELECTION_CONFIRMATION },
            player,
        );
    }

    broadcastPlayerList(ctx);

    if (!isHost) {
        return;
    }

    // A shot was mid-flight with no host to simulate it: they do it now
    if (
        ctx.gameState === GameState.SIMULATING &&
        ctx.currentShots &&
        !ctx.simulationReports.has(player.id)
    ) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.SIMULATING_HOST,
                    playerList: ctx.currentShots as Player[],
                    shouldWait: player.waitingForNextRound,
                    courseTime: ctx.courseTime,
                },
            },
            player,
        );
    }

    // The scoreboard was waiting for the host's next map: their welcome
    // already put them on it
    if (ctx.gameState === GameState.ROUND_COMPLETE) {
        finishMapLoad(ctx);
    }
}

/**
 * Tell a (re)connected player who they are, and everything about the game
 * as it is right now, so they can pick up wherever it is.
 */
function sendWelcome(ctx: ServerContext, player: Player) {
    const shouldWait = player.waitingForNextRound;

    broadcastSingle(
        {
            type: MessageTypeServer.CONNECTED,
            data: {
                playerId: player.id,
                lobbyCode: ctx.code,
                rejoinToken: player.rejoinToken,
            },
        },
        player,
    );

    // Mid-hole: where everyone's ball is (a late joiner watches until the
    // next hole; someone rejoining carries on with theirs)
    const onCourse =
        ctx.gameState !== GameState.WAITING &&
        ctx.gameState !== GameState.GAME_OVER;

    const courseState: CourseState | undefined = onCourse
        ? {
              players: getPlayersList(ctx.players).filter(
                  (other) => !other.waitingForNextRound,
              ),
              ballLocations: ctx.ballLocations,
              scoringPlayers: getScoringPlayers(ctx),
          }
        : undefined;

    const gameOver = ctx.gameState === GameState.GAME_OVER;

    broadcastSingle(
        {
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: ctx.gameState,
                isHost: ctx.hostId === player.id,
                shouldWait,
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
                lobbyCode: ctx.code,
                courseId: ctx.courseId,
                courseTime: ctx.courseTime,
                courseState,
                shotClockMs:
                    ctx.gameState === GameState.PLANNING
                        ? getShotClockMs(ctx)
                        : undefined,
                // Joining on the final scores: show them too
                playerList: gameOver ? getPlayersList(ctx.players) : undefined,
            },
        },
        player,
    );
}
