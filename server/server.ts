import { WebSocketServer, WebSocket, RawData } from "ws";
import { randomUUID } from "crypto";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection } from "./handlers/connectionHandler";
import { handleClose } from "./handlers/closeHandler";
import { ServerContext } from "./serverState";
import {
    cleanCatchphrase,
    cleanName,
    createLobby,
    findLobby,
    normalizeCode,
    removeLobbyIfEmpty,
} from "./lobbies";
import { MessageTypeClient, MessageTypeServer } from "./types/types";

const PORT = Number(process.env.PORT) || 8090;

const wss = new WebSocketServer({
    port: PORT,
});

console.log(`WebSocket server running on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
    const playerId = randomUUID();

    /** The lobby this player is in, once they've hosted or joined one. */
    let lobby: ServerContext | undefined;

    const sendError = (error: string) => {
        socket.send(
            JSON.stringify({
                type: MessageTypeServer.LOBBY_ERROR,
                data: { error },
            }),
        );
    };

    /** Before joining a lobby, a player can only host or join one. */
    const handleLobbyRequest = (data: RawData) => {
        let message: {
            type?: unknown;
            data?: { code?: unknown; name?: unknown; catchphrase?: unknown };
        };
        try {
            message = JSON.parse(data.toString());
        } catch {
            return;
        }

        if (!message || typeof message !== "object") {
            return;
        }

        const name = cleanName(message.data?.name);
        // Picked once here, so everyone sees the same one all game
        const catchphrase = cleanCatchphrase(message.data?.catchphrase);

        if (message.type === MessageTypeClient.HOST_LOBBY) {
            lobby = createLobby();
            handleConnection(socket, playerId, lobby, name, catchphrase);
            return;
        }

        if (message.type === MessageTypeClient.JOIN_LOBBY) {
            const code =
                typeof message.data?.code === "string"
                    ? normalizeCode(message.data.code)
                    : "";
            const found = findLobby(code);

            if (!found) {
                sendError(
                    code
                        ? `No game with the code ${code}`
                        : "Type the 4-letter code from your host",
                );
                return;
            }

            lobby = found;
            handleConnection(socket, playerId, lobby, name, catchphrase);
        }
    };

    socket.on("message", (data) => {
        if (lobby) {
            handleMessages(playerId, data, lobby);
        } else {
            handleLobbyRequest(data);
        }
    });

    socket.on("close", () => {
        if (!lobby) {
            return;
        }

        handleClose(playerId, lobby);
        removeLobbyIfEmpty(lobby);
    });

    // Without a listener, a socket error would crash the server
    socket.on("error", (error) => {
        console.warn(`Socket error for ${playerId}:`, error.message);
    });
});
