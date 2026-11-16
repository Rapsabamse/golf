import { WebSocket } from "ws";
import { ServerMessageData, MessageTypeServer, Player } from "./types/types";

export function broadcast(
    message: ServerMessageData,
    players: Map<string, Player>,
) {
    const data = JSON.stringify(message);

    for (const player of players.values()) {
        sendRaw(player, data);
    }
}

export function broadcastSingle(message: ServerMessageData, player: Player) {
    sendRaw(player, JSON.stringify(message));
}

export function sendPlayerList(
    players: Map<string, Player>,
    hostId: string | undefined,
    playersReady?: Set<string>,
) {
    broadcast(
        {
            type: MessageTypeServer.PLAYER_LIST,
            data: {
                playerList: getPlayersList(players, playersReady),
                hostId: hostId,
            },
        },
        players,
    );
}

export function getPlayersList(
    players: Map<string, Player>,
    playersReady?: Set<string>,
): Player[] {
    return Array.from(players.values()).map((player: Player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        ready: playersReady?.has(player.id) ?? false,
        roundState: player.roundState,
        state: { points: player.state ? player.state.points : [] },
        waitingForNextRound: player.waitingForNextRound,
    }));
}

function sendRaw(player: Player, data: string) {
    // Skip sockets that are closing or already closed
    if (player.socket?.readyState === WebSocket.OPEN) {
        player.socket.send(data);
    }
}
