import { broadcast, broadcastSingle, sendPlayerList } from "../serverHelpers";
import { GameState, MessageTypeServer, Player } from "../types/types";

export function handleClose(
    playerId: string,
    players: Map<string, Player>,
    gameState: GameState,
    setGamestate: (newGamestate: GameState) => void,
    setHostId: (id: string | undefined) => void,
    getHostId: () => string | undefined,
) {
    players.delete(playerId);

    console.log(`Player disconnected: ${playerId}`);
    console.log(`Players: ${players.size}`);

    if (playerId === getHostId()) {
        const newId = players.keys().next().value;
        if (newId) {
            setHostId(newId);
        }
    }

    // Tell remaining clients about the updated list
    sendPlayerList(players, getHostId());

    if (players.size < 1) {
        console.log("All players have left. Going back to waiting state");
        setGamestate(GameState.WAITING);
        setHostId(undefined);
    }

    let hostId = getHostId();
    if (hostId && players.get(hostId)?.waitingForNextRound) {
        console.log("Host is waiting for next round, resetting game");
        setGamestate(GameState.WAITING);

        for (const player of players.values()) {
            player.waitingForNextRound = false;

            broadcastSingle(
                {
                    type: MessageTypeServer.GAME_STATE,
                    data: {
                        state: GameState.WAITING,
                        isHost: getHostId() === player.id,
                    },
                },
                player,
            );
        }
    }
}
