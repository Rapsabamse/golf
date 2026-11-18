import { ServerContext, ShotReport } from "./serverState";
import { considerHighlight } from "./highlights";
import {
    broadcast,
    broadcastSingle,
    getPlayersList,
    sendPlayerList,
} from "./serverHelpers";
import {
    BallLocation,
    GameState,
    MessageTypeServer,
    getCourse,
    Player,
    SHOT_CLOCK_MS,
    ShotStats,
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
    const holes = getCourse(ctx.courseId).holes;
    return holes[ctx.holeIndex % holes.length];
}

/** Host picked a course in the lobby: everyone sees the choice. */
export function selectCourse(ctx: ServerContext, courseId: string) {
    ctx.courseId = getCourse(courseId).id;

    for (const player of ctx.players.values()) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.WAITING,
                    isHost: ctx.hostId === player.id,
                    mapName: getCurrentMapName(ctx),
                    hole: 1,
                    courseId: ctx.courseId,
                },
            },
            player,
        );
    }
}

/** Players taking part in the current round (not waiting to join). */
export function getActivePlayers(ctx: ServerContext): Player[] {
    return Array.from(ctx.players.values()).filter(
        (player) => !player.waitingForNextRound,
    );
}

/** False while a player's connection is gone and their place is held. */
export function isConnected(player: Player) {
    return player.connected !== false;
}

/**
 * Players who still have a shot to take on this hole and are here to take
 * it. Players whose connection dropped never hold anyone up.
 */
function getConnectedShooters(ctx: ServerContext): Player[] {
    return getActivePlayers(ctx).filter(
        (player) => !player.roundState?.hasScored && isConnected(player),
    );
}

/** Start the clock for a new shot. When it runs out, the shot starts anyway. */
export function startShotClock(ctx: ServerContext) {
    stopShotClock(ctx);

    ctx.shotClockEndsAt = Date.now() + SHOT_CLOCK_MS;
    ctx.shotClockTimer = setTimeout(() => {
        ctx.shotClockTimer = undefined;
        ctx.shotClockEndsAt = undefined;
        console.log(`Lobby ${ctx.code}: shot clock ran out`);
        tryStartSimulation(ctx, true);
    }, SHOT_CLOCK_MS);
}

export function stopShotClock(ctx: ServerContext) {
    if (ctx.shotClockTimer) {
        clearTimeout(ctx.shotClockTimer);
    }

    ctx.shotClockTimer = undefined;
    ctx.shotClockEndsAt = undefined;
}

/** Time left on the shot clock, for clients (undefined when it isn't running). */
export function getShotClockMs(ctx: ServerContext): number | undefined {
    return ctx.shotClockEndsAt === undefined
        ? undefined
        : Math.max(0, ctx.shotClockEndsAt - Date.now());
}

/**
 * A new shot: start the clock and tell everyone, with where the balls are
 * (extra) if they moved.
 */
function startPlanning(
    ctx: ServerContext,
    extra: { ballLocations?: BallLocation[]; scoringPlayers?: string[] } = {},
) {
    ctx.gameState = GameState.PLANNING;
    ctx.playersReady.clear();

    // Nobody here to shoot: the clock waits until someone comes back
    if (getConnectedShooters(ctx).length > 0) {
        startShotClock(ctx);
    } else {
        stopShotClock(ctx);
    }

    for (const player of ctx.players.values()) {
        broadcastSingle(
            {
                type: MessageTypeServer.GAME_STATE,
                data: {
                    state: GameState.PLANNING,
                    mapName: getCurrentMapName(ctx),
                    hole: ctx.holeIndex + 1,
                    shouldWait: player.waitingForNextRound,
                    shotClockMs: getShotClockMs(ctx),
                    courseTime: ctx.courseTime,
                    ...extra,
                },
            },
            player,
        );
    }

    // New planning phase: nobody is locked in, some may have holed out
    broadcastPlayerList(ctx);
}

export function getScoringPlayers(ctx: ServerContext): string[] {
    return Array.from(ctx.players.values())
        .filter((player) => player.roundState?.hasScored)
        .map((player) => player.id);
}

/**
 * The best player to be host: someone connected and playing (so a late
 * joiner never becomes host mid-round), else anyone connected. Undefined
 * when nobody is connected.
 */
export function pickHost(ctx: ServerContext): string | undefined {
    const connected = Array.from(ctx.players.values()).filter(isConnected);

    return (
        connected.find((player) => !player.waitingForNextRound)?.id ??
        connected[0]?.id
    );
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
    ctx.courseTime = 0;
    ctx.holeMaxShots = [];
    ctx.ballLocations = [];
    ctx.holeHighlight = undefined;
    clearRoundTracking(ctx);

    for (const player of ctx.players.values()) {
        player.state = { points: [] };
        player.roundState = { shots: 0, hasScored: false };
        player.waitingForNextRound = false;
        player.shot = undefined;
    }

    startPlanning(ctx);
}

/** Send everyone back to the lobby with a clean scoreboard. */
export function resetGame(ctx: ServerContext) {
    console.log("Resetting game to the lobby");

    ctx.gameState = GameState.WAITING;
    ctx.holeIndex = 0;
    ctx.courseTime = 0;
    ctx.holeMaxShots = [];
    ctx.ballLocations = [];
    ctx.currentShots = undefined;
    ctx.holeHighlight = undefined;
    stopShotClock(ctx);
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
                    courseId: ctx.courseId,
                },
            },
            player,
        );
    }

    broadcastPlayerList(ctx);
}

/**
 * Start simulating once every connected player who still has to shoot has
 * locked in, or when the shot clock runs out (clockRanOut). Called when
 * someone locks in, and when someone leaves (they might have been the last
 * one everyone was waiting for).
 *
 * Who shoots: everyone who locked in, and when the clock ran out, anyone
 * who had aimed. Anyone else stays still, and it doesn't count as a shot.
 */
export function tryStartSimulation(ctx: ServerContext, clockRanOut = false) {
    if (ctx.gameState !== GameState.PLANNING) {
        return;
    }

    const connectedShooters = getConnectedShooters(ctx);

    // Nobody here to shoot (everyone's connection dropped): wait for them
    if (connectedShooters.length === 0) {
        stopShotClock(ctx);
        return;
    }

    if (
        !clockRanOut &&
        !connectedShooters.every((player) => ctx.playersReady.has(player.id))
    ) {
        return;
    }

    const shooters = getActivePlayers(ctx).filter(
        (player) =>
            !player.roundState?.hasScored &&
            player.shot !== undefined &&
            (ctx.playersReady.has(player.id) || clockRanOut),
    );

    stopShotClock(ctx);

    // Nobody aimed before the clock ran out: nothing moves, next shot
    if (shooters.length === 0) {
        for (const player of ctx.players.values()) {
            player.shot = undefined;
        }

        startPlanning(ctx);
        return;
    }

    ctx.playersReady.clear();
    ctx.simulationReports.clear();
    ctx.gameState = GameState.SIMULATING;

    const playerList = Array.from(ctx.players.values()).map((player) => ({
        id: player.id,
        shot: shooters.includes(player) ? player.shot : undefined,
    }));

    ctx.currentShots = playerList;

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
                    courseTime: ctx.courseTime,
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
    steps = 0,
    shots: ShotReport[] = [],
) {
    if (ctx.gameState !== GameState.SIMULATING) {
        return;
    }

    // The shots that didn't go in might still be the shot of the hole
    const shooters = new Set(
        (ctx.currentShots ?? [])
            .filter((entry) => entry.shot)
            .map((entry) => entry.id),
    );

    for (const { playerId, shot } of shots) {
        const player = ctx.players.get(playerId);

        if (
            player?.roundState &&
            !player.roundState.hasScored &&
            shooters.has(playerId)
        ) {
            considerHighlight(ctx, player, player.roundState.shots, shot, false);
        }
    }

    ctx.ballLocations = locations;
    // Obstacles carry on from where the host's simulation left them
    ctx.courseTime += steps;
    ctx.currentShots = undefined;

    console.log("broadcasting ball-locations");

    startPlanning(ctx, {
        ballLocations: ctx.ballLocations,
        scoringPlayers: getScoringPlayers(ctx),
    });
}

export function applyGoal(
    ctx: ServerContext,
    scoringPlayerId: string,
    shot?: ShotStats,
) {
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

    // Might be the shot of the hole
    if (shot) {
        considerHighlight(ctx, player, player.roundState.shots, shot, true);
    }

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

    // Players whose connection dropped don't hold up the hole; if they
    // don't finish it, they get its worst score like late joiners
    const active = getActivePlayers(ctx).filter(isConnected);

    if (
        active.length === 0 ||
        !active.every((player) => player.roundState?.hasScored)
    ) {
        return;
    }

    const wasLastHole =
        ctx.holeIndex + 1 >= getCourse(ctx.courseId).holes.length;

    ctx.ballLocations = [];
    ctx.currentShots = undefined;
    stopShotClock(ctx);
    clearRoundTracking(ctx);

    // Replayed for everyone before the scores
    const shotOfHole = ctx.holeHighlight;
    ctx.holeHighlight = undefined;

    // Whoever joined during this hole (or left before finishing it) gets
    // its worst score
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
                    shotOfHole,
                },
            },
            ctx.players,
        );
        return;
    }

    ctx.holeIndex += 1;
    ctx.courseTime = 0;
    ctx.gameState = GameState.ROUND_COMPLETE;

    broadcast(
        {
            type: MessageTypeServer.GAME_STATE,
            data: {
                state: GameState.ROUND_COMPLETE,
                playerList: getPlayersList(ctx.players),
                mapName: getCurrentMapName(ctx),
                hole: ctx.holeIndex + 1,
                shotOfHole,
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

    startPlanning(ctx);
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
            applyGoal(
                ctx,
                scoringPlayerId,
                report.goalShots?.get(scoringPlayerId),
            );
        }

        if (report.locations) {
            finishSimulation(ctx, report.locations, report.steps, report.shots);
        }
    } else if (
        ctx.gameState === GameState.ROUND_COMPLETE &&
        ctx.mapLoaded.has(hostId)
    ) {
        finishMapLoad(ctx);
    }
}
