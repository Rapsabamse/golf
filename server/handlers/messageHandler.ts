import { RawData } from "ws";
import {
    BallLocation,
    COURSES,
    GameState,
    MAX_SHOT_SPEED,
    MessageTypeClient,
    MessageTypeServer,
    ShotStats,
    Vector,
} from "../types/types";
import { parseShotStats } from "../highlights";
import { broadcastSingle } from "../serverHelpers";
import { ServerContext, ShotReport, SimulationReport } from "../serverState";
import {
    applyGoal,
    broadcastPlayerList,
    finishMapLoad,
    finishSimulation,
    startGame,
    resetGame,
    selectCourse,
    tryStartSimulation,
} from "../gameLogic";

const MAX_NAME_LENGTH = 16;
/** More shots in one report than any lobby has players. */
const MAX_SHOT_REPORTS = 16;

export function handleMessages(
    playerId: string,
    data: RawData,
    ctx: ServerContext,
) {
    // A broken message must never crash the server
    let message: { type?: unknown; data?: unknown };
    try {
        message = JSON.parse(data.toString());
    } catch {
        console.warn(`Ignoring invalid message from ${playerId}`);
        return;
    }

    if (!message || typeof message !== "object") {
        return;
    }

    const player = ctx.players.get(playerId);
    if (!player) {
        return;
    }

    const isHost = playerId === ctx.hostId;
    const isPlaying =
        !player.waitingForNextRound && !player.roundState?.hasScored;

    switch (message.type) {
        case MessageTypeClient.NAME: {
            if (typeof message.data !== "string") {
                return;
            }

            const name = message.data.trim().slice(0, MAX_NAME_LENGTH);
            if (name) {
                player.name = name;
                console.log(playerId, " set their name to: ", name);
                broadcastPlayerList(ctx);
            }
            break;
        }

        // The host picks the course in the lobby
        case MessageTypeClient.SELECT_COURSE:
            if (
                ctx.gameState === GameState.WAITING &&
                isHost &&
                typeof message.data === "string" &&
                COURSES.some((course) => course.id === message.data)
            ) {
                selectCourse(ctx, message.data);
            }
            break;

        // The host starts the game from the lobby
        case MessageTypeClient.START_GAME:
            if (ctx.gameState === GameState.WAITING && isHost) {
                startGame(ctx);
            }
            break;

        // The host starts a new game from the final scores, with everyone
        // who is connected (including anyone who joined in the meantime)
        case MessageTypeClient.PLAY_AGAIN:
            // Everyone goes back to the lobby together, to start again from there
            if (ctx.gameState === GameState.GAME_OVER && isHost) {
                console.log("Host took everyone back to the lobby");
                resetGame(ctx);
            }
            break;

        // Client sends their last selected shot
        case MessageTypeClient.SHOT_SELECTED: {
            if (ctx.gameState !== GameState.PLANNING || !isPlaying) {
                return;
            }

            const direction = parseShot(message.data);
            if (!direction) {
                return;
            }

            console.log(
                `Player ${playerId} has selected a new shot - X: ${direction.x} Y: ${direction.y}`,
            );

            player.shot = { direction };
            break;
        }

        // Client locks in their shot
        case MessageTypeClient.READY:
            if (
                ctx.gameState !== GameState.PLANNING ||
                !isPlaying ||
                !player.shot
            ) {
                return;
            }

            ctx.playersReady.add(playerId);

            broadcastSingle(
                { type: MessageTypeServer.SHOT_SELECTION_CONFIRMATION },
                player,
            );

            // Let everyone see who has locked in
            broadcastPlayerList(ctx);

            tryStartSimulation(ctx);
            break;

        // Client finished simulating the round
        case MessageTypeClient.SIMULATION_DONE: {
            if (ctx.gameState !== GameState.SIMULATING) {
                return;
            }

            // { locations, steps, shots }, or just the locations from older clients
            const result =
                message.data && !Array.isArray(message.data)
                    ? (message.data as {
                          locations?: unknown;
                          steps?: unknown;
                          shots?: unknown;
                      })
                    : { locations: message.data };
            const locations = parseLocations(result.locations);
            const steps = parseSteps(result.steps);
            const shots = parseShotReports(result.shots);

            const report = getReport(ctx, playerId);
            report.locations = locations;
            report.steps = steps;
            report.shots = shots;

            if (isHost) {
                finishSimulation(ctx, locations, steps, shots);
            }
            break;
        }

        // Client saw a ball go into the hole during the simulation
        case MessageTypeClient.PLAYER_GOAL: {
            if (ctx.gameState !== GameState.SIMULATING) {
                return;
            }

            // Who went in, and (newer clients) what the putt looked like
            const goal = parseGoal(message.data);
            if (!goal) {
                return;
            }

            const report = getReport(ctx, playerId);
            report.goals.add(goal.playerId);
            if (goal.shot) {
                report.goalShots ??= new Map();
                report.goalShots.set(goal.playerId, goal.shot);
            }

            // Only the host's simulation counts
            if (isHost) {
                applyGoal(ctx, goal.playerId, goal.shot);
            }
            break;
        }

        // Client finished loading the next map
        case MessageTypeClient.LOADED_NEW_MAP:
            if (ctx.gameState !== GameState.ROUND_COMPLETE) {
                return;
            }

            ctx.mapLoaded.add(playerId);

            if (isHost) {
                finishMapLoad(ctx);
            }
            break;
    }
}

/** PLAYER_GOAL's data: a player id, or { playerId, shot }. */
function parseGoal(
    data: unknown,
): { playerId: string; shot?: ShotStats } | undefined {
    if (typeof data === "string") {
        return { playerId: data };
    }

    if (!data || typeof data !== "object") {
        return undefined;
    }

    const goal = data as Record<string, unknown>;
    if (typeof goal.playerId !== "string") {
        return undefined;
    }

    return { playerId: goal.playerId, shot: parseShotStats(goal.shot) };
}

function getReport(ctx: ServerContext, playerId: string): SimulationReport {
    let report = ctx.simulationReports.get(playerId);

    if (!report) {
        report = { goals: new Set() };
        ctx.simulationReports.set(playerId, report);
    }

    return report;
}

/** Accept only a real {x, y} shot, capped at the strongest shot the client allows. */
function parseShot(data: unknown): Vector | undefined {
    if (!data || typeof data !== "object") {
        return undefined;
    }

    const { x, y } = data as Record<string, unknown>;

    if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return undefined;
    }

    const length = Math.hypot(x, y);
    const scale = length > MAX_SHOT_SPEED ? MAX_SHOT_SPEED / length : 1;

    return { x: x * scale, y: y * scale };
}

/** A simulation's length in physics steps: a whole number, within reason. */
/** The shots that didn't go in, as { playerId, shot }. Bad ones are dropped. */
function parseShotReports(data: unknown): ShotReport[] {
    if (!Array.isArray(data)) {
        return [];
    }

    const reports: ShotReport[] = [];

    for (const entry of data.slice(0, MAX_SHOT_REPORTS)) {
        if (!entry || typeof entry.playerId !== "string") {
            continue;
        }

        const shot = parseShotStats(entry.shot);
        if (shot) {
            reports.push({ playerId: entry.playerId, shot });
        }
    }

    return reports;
}

function parseSteps(data: unknown): number {
    return typeof data === "number" && Number.isFinite(data)
        ? Math.max(0, Math.min(100_000, Math.round(data)))
        : 0;
}

function parseLocations(data: unknown): BallLocation[] {
    if (!Array.isArray(data)) {
        return [];
    }

    return data.filter(
        (location): location is BallLocation =>
            !!location &&
            typeof location.playerId === "string" &&
            Number.isFinite(location.x) &&
            Number.isFinite(location.y),
    );
}
