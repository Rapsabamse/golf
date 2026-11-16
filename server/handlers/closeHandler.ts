import { ServerContext } from "../serverState";
import { GameState } from "../types/types";
import {
    broadcastPlayerList,
    getActivePlayers,
    pickHost,
    resetGame,
    resumeWithNewHost,
    tryCompleteRound,
    tryStartSimulation,
} from "../gameLogic";

export function handleClose(playerId: string, ctx: ServerContext) {
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
        ctx.hostId = pickHost(ctx);
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
