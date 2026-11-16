import { ServerContext } from "./serverState";
import {
    broadcast,
    broadcastSingle,
    getPlayersList,
    sendPlayerList,
} from "./serverHelpers";
import {
    BallLocation,
    GameState,
    MAPS,
    MessageTypeServer,
    Player,
} from "./types/types";

/** Ball colours, picked to stand out against the green course. */
export const PLAYER_COLORS = [
    0xff5252, // red
    0x40c4ff, // blue
    0xffd740, // yellow
    0xe040fb, // purple
    0xff9100, // orange
    0xffffff, // white
    0xff80ab, // pink
    0x18ffff, // cyan
];

/** First colour nobody is using (colours repeat after 8 players). */
export function pickColor(ctx: ServerContext): number {
    const used = new Set(
        Array.from(ctx.players.values()).map((player) => player.color),
    );

    return (
        PLAYER_COLORS.find((color) => !used.has(color)) ??
        PLAYER_COLORS[ctx.players.size % PLAYER_COLORS.length]
    );
}

/** Send everyone the player list, including who has locked in. */
export function broadcastPlayerList(ctx: ServerContext) {
    sendPlayerList(ctx.players, ctx.hostId, ctx.playersReady);
}

export function getCurrentMapName(ctx: ServerContext) {
    return MAPS[ctx.holeIndex % MAPS.length];
}

/** Players taking part in the current round (not waiting to join). */
export function getActivePlayers(ctx: ServerContext): Player[] {
    return Array.from(ctx.players.values()).filter(
        (player) => !player.waitingForNextRound,
    );
}

export function getScoringPlayers(ctx: ServerContext): string[] {
    return Array.from(ctx.players.values())
        .filter((player) => player.roundState?.hasScored)
        .map((player) => player.id);
}

/** Prefer someone who is actually playing, so a late joiner never becomes host mid-round. */
export function pickHost(ctx: ServerContext): string | undefined {
    return getActivePlayers(ctx)[0]?.id ?? ctx.players.keys().next().value;
}

function clearRoundTracking(ctx: ServerContext) {
    ctx.playersReady.clear();
    ctx.simulationReports.clear();
    ctx.mapLoaded.clear();
}

/**
 * Give a player who joined late the worst score of every finished hole they
 * didn't play, so they can't win by missing holes.
 */
export function fillMissedHoles(
    ctx: ServerContext,
    player: Player,
    finishedHoles: number,
) {
    player.state ??= { points: [] };

    for (let hole = 0; hole < finishedHoles; hole++) {
        const worst = ctx.holeMaxShots[hole];

        if (
            worst === undefined ||
            (player.state.points[hole] !== null &&
                player.state.points[hole] !== undefined)
        ) {
            continue;
        }

        player.state.points[hole] = worst;
        player.state.missedHoles ??= [];
        player.state.missedHoles.push(hole);
    }
}

/** Host pressed "Start Game" in the lobby. */
export function startGame(ctx: ServerContext) {
    console.log("Starting planning phase");

    ctx.holeIndex = 0;
    ctx.holeMaxShots = [];
    ctx.ballLocations = [];
    clearRoundTracking(ctx);

    for (const player of ctx.players.values()) {
        player.state = { points: [] };
        player.roundState = { shots: 0, hasScored: false };
        player.waitingForNextRound = false;
        player.shot = undefined;
    }

    ctx.gameState = GameState.PLANNING;

    broadcast(
        {
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: GameState.PLANNING,
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
            },
        },
        ctx.players,
    );

    broadcastPlayerList(ctx);
}

/** Send everyone back to the lobby with a clean scoreboard. */
export function resetGame(ctx: ServerContext) {
    console.log("Resetting game to the lobby");

    ctx.gameState = GameState.WAITING;
    ctx.holeIndex = 0;
    ctx.holeMaxShots = [];
    ctx.ballLocations = [];
    clearRoundTracking(ctx);

    for (const player of ctx.players.values()) {
        player.state = { points: [] };
        player.roundState = undefined;
        player.shot = undefined;
        player.waitingForNextRound = false;
    }

    for (const player of ctx.players.values()) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.WAITING,
                    isHost: ctx.hostId === player.id,
                    mapName: getCurrentMapName(ctx),
                    hole: ctx.holeIndex + 1,
                },
            },
            player,
        );
    }

    broadcastPlayerList(ctx);
}

/**
 * Start simulating once every player who still has to shoot has locked in.
 * Called when someone locks in, and when someone leaves (they might have
 * been the last one everyone was waiting for).
 */
export function tryStartSimulation(ctx: ServerContext) {
    if (ctx.gameState !== GameState.PLANNING) {
        return;
    }

    const shooters = getActivePlayers(ctx).filter(
        (player) => !player.roundState?.hasScored,
    );

    if (shooters.length === 0) {
        return;
    }

    if (!shooters.every((player) => ctx.playersReady.has(player.id))) {
        return;
    }

    ctx.playersReady.clear();
    ctx.simulationReports.clear();
    ctx.gameState = GameState.SIMULATING;

    const playerList = Array.from(ctx.players.values()).map((player) => ({
        id: player.id,
        shot: player.shot,
    }));

    console.log("Sending simulation data to clients");

    // Only the host gets SIMULATING_HOST
    for (const player of ctx.players.values()) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state:
                        player.id === ctx.hostId
                            ? GameState.SIMULATING_HOST
                            : GameState.SIMULATING,
                    playerList: playerList as Player[],
                    shouldWait: player.waitingForNextRound,
                },
            },
            player,
        );
    }

    // This shot counts for everyone who took it
    for (const player of shooters) {
        player.roundState!.shots += 1;
    }

    for (const player of ctx.players.values()) {
        player.shot = undefined;
    }
}

/** The host's simulation finished: everyone moves their balls to its result. */
export function finishSimulation(
    ctx: ServerContext,
    locations: BallLocation[],
) {
    if (ctx.gameState !== GameState.SIMULATING) {
        return;
    }

    ctx.ballLocations = locations;
    ctx.gameState = GameState.PLANNING;

    console.log("broadcasting ball-locations");

    const scoringPlayers = getScoringPlayers(ctx);

    for (const player of ctx.players.values()) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.PLANNING,
                    ballLocations: ctx.ballLocations,
                    scoringPlayers,
                    shouldWait: player.waitingForNextRound,
                },
            },
            player,
        );
    }

    // New planning phase: nobody is locked in, some may have holed out
    broadcastPlayerList(ctx);
}

export function applyGoal(ctx: ServerContext, scoringPlayerId: string) {
    const player = ctx.players.get(scoringPlayerId);

    if (
        !player ||
        !player.roundState ||
        player.roundState.hasScored ||
        player.waitingForNextRound
    ) {
        return;
    }

    player.roundState.hasScored = true;
    player.state ??= { points: [] };
    player.state.points[ctx.holeIndex] = player.roundState.shots;

    // Counts even if this player leaves before the hole ends
    ctx.holeMaxShots[ctx.holeIndex] = Math.max(
        ctx.holeMaxShots[ctx.holeIndex] ?? 0,
        player.roundState.shots,
    );

    console.log(
        "Player ",
        scoringPlayerId,
        " Scored! Shots needed:",
        player.roundState.shots,
    );

    tryCompleteRound(ctx);
}

/**
 * End the hole once every active player has holed out. Called after a goal,
 * and when someone leaves (they might have been the last one still playing).
 */
export function tryCompleteRound(ctx: ServerContext) {
    if (
        ctx.gameState !== GameState.PLANNING &&
        ctx.gameState !== GameState.SIMULATING
    ) {
        return;
    }

    const active = getActivePlayers(ctx);

    if (
        active.length === 0 ||
        !active.every((player) => player.roundState?.hasScored)
    ) {
        return;
    }

    const wasLastHole = ctx.holeIndex + 1 >= MAPS.length;

    ctx.ballLocations = [];
    clearRoundTracking(ctx);

    // Whoever joined during this hole gets its worst score
    for (const player of ctx.players.values()) {
        fillMissedHoles(ctx, player, ctx.holeIndex + 1);
    }

    // Everyone, including late joiners, plays the next hole (or game)
    for (const player of ctx.players.values()) {
        player.roundState = { shots: 0, hasScored: false };
        player.waitingForNextRound = false;
        player.shot = undefined;
        player.state ??= { points: [] };
    }

    if (wasLastHole) {
        console.log("Last hole finished: game over");

        ctx.gameState = GameState.GAME_OVER;

        broadcast(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.GAME_OVER,
                    playerList: getPlayersList(ctx.players),
                },
            },
            ctx.players,
        );
        return;
    }

    ctx.holeIndex += 1;
    ctx.gameState = GameState.ROUND_COMPLETE;

    broadcast(
        {
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: GameState.ROUND_COMPLETE,
                playerList: getPlayersList(ctx.players),
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
            },
        },
        ctx.players,
    );
}

/** The host has loaded the next map: start planning. */
export function finishMapLoad(ctx: ServerContext) {
    if (ctx.gameState !== GameState.ROUND_COMPLETE) {
        return;
    }

    ctx.mapLoaded.clear();
    ctx.gameState = GameState.PLANNING;

    broadcast(
        {
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: GameState.PLANNING,
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
            },
        },
        ctx.players,
    );

    broadcastPlayerList(ctx);
}

/**
 * A new host took over in the middle of a phase. Their earlier messages were
 * ignored because they weren't host yet, so use what they already reported.
 */
export function resumeWithNewHost(ctx: ServerContext) {
    const hostId = ctx.hostId;

    if (!hostId) {
        return;
    }

    if (ctx.gameState === GameState.SIMULATING) {
        const report = ctx.simulationReports.get(hostId);

        if (!report) {
            return; // Their result will arrive as the new host
        }

        for (const scoringPlayerId of report.goals) {
            applyGoal(ctx, scoringPlayerId);
        }

        if (report.locations) {
            finishSimulation(ctx, report.locations);
        }
    } else if (
        ctx.gameState === GameState.ROUND_COMPLETE &&
        ctx.mapLoaded.has(hostId)
    ) {
        finishMapLoad(ctx);
    }
}
