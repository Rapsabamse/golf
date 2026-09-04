import { sendPlayerList } from "../serverHelpers";
import { GameState, Player } from "../types/types";

export function handleClose(
    playerId: string,
    players: Map<string, Player>,
    gameState: GameState,
    setGamestate: (newGamestate: GameState) => void,
    setHostId: (id: string) => void,
    getHostId: () => string | undefined,
) {
    players.delete(playerId);

    console.log(`Player disconnected: ${playerId}`);
    console.log(`Players: ${players.size}`);

    // Tell remaining clients about the updated list
    sendPlayerList(players);

    if (playerId === getHostId()) {
        const newId = players.keys().next().value;
        if (newId) {
            setHostId(newId);
        }
    }

    if (players.size < 1) {
        console.log("All players have left. Going back to waiting state");
        setGamestate(GameState.WAITING);
    }
}
