import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { GameState as GameState, Player } from "./types/types";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection } from "./handlers/connectionHandler";
import { handleClose } from "./handlers/closeHandler";

const PORT = 8090;

const wss = new WebSocketServer({
    port: PORT,
});

const players = new Map<string, Player>();
let gameState = GameState.WAITING;

console.log(`WebSocket server running on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
    const playerId = randomUUID();

    handleConnection(socket, players, gameState, playerId);

    socket.on("message", (data) => {
        handleMessages(playerId, data, gameState, players, setGamestate);
    });

    socket.on("close", () => {
        handleClose(playerId, players, gameState);
    });
});

function setGamestate(newGamestate: GameState) {
    gameState = newGamestate;
}
