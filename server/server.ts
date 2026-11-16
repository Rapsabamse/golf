import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection } from "./handlers/connectionHandler";
import { handleClose } from "./handlers/closeHandler";
import { createServerContext } from "./serverState";

const PORT = Number(process.env.PORT) || 8090;

const wss = new WebSocketServer({
    port: PORT,
});

const ctx = createServerContext();

console.log(`WebSocket server running on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
    const playerId = randomUUID();

    handleConnection(socket, playerId, ctx);

    socket.on("message", (data) => {
        handleMessages(playerId, data, ctx);
    });

    socket.on("close", () => {
        handleClose(playerId, ctx);
    });

    // Without a listener, a socket error would crash the server
    socket.on("error", (error) => {
        console.warn(`Socket error for ${playerId}:`, error.message);
    });
});
