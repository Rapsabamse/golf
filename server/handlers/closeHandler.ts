import { ServerContext } from "../serverState";
import { GameState, REJOIN_GRACE_MS } from "../types/types";
import { WebSocket } from "ws";
import {
    broadcastPlayerList,
    getActivePlayers,
    isConnected,
    pickHost,
    resetGame,
    resumeWithNewHost,
    stopShotClock,
    tryCompleteRound,
    tryStartSimulation,
} from "../gameLogic";
import { removeLobbyIfEmpty } from "../lobbies";

/**
 * A player's connection dropped (a refresh, a closed tab, a network blip).
 * Their place, ball and scores are kept for a while so they can rejoin as
 * themselves; meanwhile they don't hold anyone up.
 */
export function handleDisconnect(
    playerId: string,
    ctx: ServerContext,
    socket: WebSocket,
) {
    const player = ctx.players.get(playerId);

    // Already gone, or they've rejoined on a newer connection since
    if (!player || player.socket !== socket) {
        return;
    }

    player.socket = undefined;
    player.connected = false;

    console.log(`Player ${playerId} lost connection; holding their place`);

    clearTimeout(player.removeTimer);
    player.removeTimer = setTimeout(() => {
        console.log(`Player ${playerId} didn't come back`);
        handleClose(playerId, ctx);
        removeLobbyIfEmpty(ctx);
    }, REJOIN_GRACE_MS);

    // Someone who's here takes over as host
    const hostChanged = ctx.hostId === playerId && moveHost(ctx);

    broadcastPlayerList(ctx);

    if (hostChanged) {
        resumeWithNewHost(ctx);
    }

    // Nobody left to play: everything waits until someone comes back
    if (!Array.from(ctx.players.values()).some(isConnected)) {
        stopShotClock(ctx);
        return;
    }

    // They may have been the one everyone was waiting for
    tryCompleteRound(ctx);
    tryStartSimulation(ctx);
}

/** Make a connected player host, if there is one. True if the host changed. */
function moveHost(ctx: ServerContext) {
    const next = pickHost(ctx);

    if (!next || next === ctx.hostId) {
        return false;
    }

    ctx.hostId = next;
    console.log(`Set new host. Id: `, ctx.hostId);
    return true;
}

/** A player is gone for good: they left, or didn't rejoin in time. */
export function handleClose(playerId: string, ctx: ServerContext) {
    const player = ctx.players.get(playerId);
    clearTimeout(player?.removeTimer);

    const wasHost = ctx.hostId === playerId;

    ctx.players.delete(playerId);
    ctx.playersReady.delete(playerId);
    ctx.simulationReports.delete(playerId);
    ctx.mapLoaded.delete(playerId);

    console.log(`Player disconnected: ${playerId}`);
    console.log(`Players: ${ctx.players.size}`);

    if (ctx.players.size === 0) {
        console.log("All players have left. Going back to waiting state");
        ctx.hostId = undefined;
        resetGame(ctx);
        return;
    }

    if (wasHost) {
        // Nobody connected: someone stays host so they can carry on if they come back
        ctx.hostId = pickHost(ctx) ?? ctx.players.keys().next().value;
        console.log(`Set new host. Id: `, ctx.hostId);
    }

    // Only late joiners are left: nobody can finish this round
    if (
        ctx.gameState !== GameState.WAITING &&
        getActivePlayers(ctx).length === 0
    ) {
        console.log("No active players left, resetting game");
        resetGame(ctx);
        return;
    }

    // Tell remaining clients about the updated list
    broadcastPlayerList(ctx);

    if (wasHost) {
        resumeWithNewHost(ctx);
    }

    // The player who left may have been the one everyone was waiting for
    tryCompleteRound(ctx);
    tryStartSimulation(ctx);
}
