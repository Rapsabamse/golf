import { RawData } from "ws";
import {
    BallLocation,
    GameState,
    MAX_SHOT_SPEED,
    MessageTypeClient,
    MessageTypeServer,
    Vector,
} from "../types/types";
import { broadcastSingle } from "../serverHelpers";
import { ServerContext, SimulationReport } from "../serverState";
import {
    applyGoal,
    broadcastPlayerList,
    finishMapLoad,
    finishSimulation,
    startGame,
    tryStartSimulation,
} from "../gameLogic";

const MAX_NAME_LENGTH = 16;

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

        // The host starts the game from the lobby
        case MessageTypeClient.START_GAME:
            if (ctx.gameState === GameState.WAITING && isHost) {
                startGame(ctx);
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

            const locations = parseLocations(message.data);
            getReport(ctx, playerId).locations = locations;

            if (isHost) {
                finishSimulation(ctx, locations);
            }
            break;
        }

        // Client saw a ball go into the hole during the simulation
        case MessageTypeClient.PLAYER_GOAL:
            if (
                ctx.gameState !== GameState.SIMULATING ||
                typeof message.data !== "string"
            ) {
                return;
            }

            getReport(ctx, playerId).goals.add(message.data);

            // Only the host's simulation counts
            if (isHost) {
                applyGoal(ctx, message.data);
            }
            break;

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
