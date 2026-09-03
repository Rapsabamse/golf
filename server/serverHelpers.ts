import { ServerMessageData, MessageTypeServer, Player } from "./types/types";

export function broadcast(
    message: ServerMessageData,
    players: Map<string, Player>,
) {
    const data = JSON.stringify(message);

    for (const player of players.values()) {
        player.socket.send(data);
    }
}

export function sendPlayerList(players: Map<string, Player>) {
    const playerList = Array.from(players.values()).map((player) => ({
        id: player.id,
        ready: player.ready,
    }));

    const message = JSON.stringify({
        type: MessageTypeServer.PLAYER_LIST,
        players: playerList,
    });

    for (const player of players.values()) {
        player.socket.send(message);
    }
}
