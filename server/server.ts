import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { GameStates as GameState, MessageTypes, Player } from "./types/types";
import { Socket } from "dgram";

const PORT = 8090;

const wss = new WebSocketServer({
    port: PORT,
});

const players = new Map<string, Player>();
let gameState = GameState.WAITING;

console.log(`WebSocket server running on port ${PORT}`);

function sendPlayerList() {
    const playerList = Array.from(players.values()).map((player) => ({
        id: player.id,
        ready: player.ready,
    }));

    const message = JSON.stringify({
        type: MessageTypes.PLAYER_LIST,
        players: playerList,
    });

    for (const player of players.values()) {
        player.socket.send(message);
    }
}

wss.on("connection", (socket: WebSocket) => {
    const playerId = randomUUID();

    const player: Player = {
        id: playerId,
        socket,
        ready: false,
    };

    players.set(playerId, player);

    console.log(`Player connected: ${playerId}`);
    console.log(`Players: ${players.size}`);

    // Tell the client which ID belongs to them
    socket.send(
        JSON.stringify({
            type: MessageTypes.CONNECTED,
            playerId,
        }),
    );

    // Send the current game state to the client
    socket.send(
        JSON.stringify({
            type: MessageTypes.GAME_STATE,
            state: gameState,
        }),
    );

    // Send the updated player list to everyone
    sendPlayerList();

    socket.on("close", () => {
        players.delete(playerId);

        console.log(`Player disconnected: ${playerId}`);
        console.log(`Players: ${players.size}`);

        // Tell remaining clients about the updated list
        sendPlayerList();
    });

    socket.on("message", (data) => {
        console.log(`Message from ${playerId}:`, data.toString());

        const message = JSON.parse(data.toString());

        //Send to other clients that the game has started, and the planning phase has started
        if (
            message.type === MessageTypes.START_GAME &&
            gameState === GameState.WAITING
        ) {
            console.log("Starting planning phase");

            if (gameState !== GameState.WAITING) {
                return;
            }

            gameState = GameState.PLANNING;

            broadcast({
                type: MessageTypes.GAME_STATE,
                state: gameState,
            });
        }
    });
});

function broadcast(message: object) {
    const data = JSON.stringify(message);

    for (const player of players.values()) {
        player.socket.send(data);
    }
}
