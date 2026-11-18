import { WebSocketServer, WebSocket, RawData } from "ws";
import { randomUUID } from "crypto";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection, handleRejoin } from "./handlers/connectionHandler";
import { handleDisconnect } from "./handlers/closeHandler";
import { ServerContext } from "./serverState";
import {
    cleanCatchphrase,
    cleanName,
    createLobby,
    findLobby,
    normalizeCode,
} from "./lobbies";
import { MessageTypeClient, MessageTypeServer } from "./types/types";

const PORT = Number(process.env.PORT) || 8090;
/** How often to check each connection is still alive. */
const HEARTBEAT_MS = 10_000;

const wss = new WebSocketServer({
    port: PORT,
});

console.log(`WebSocket server running on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
    // A rejoining player gets their old ID back
    let playerId: string = randomUUID();

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
            data?: {
                code?: unknown;
                name?: unknown;
                catchphrase?: unknown;
                token?: unknown;
                takeover?: unknown;
            };
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

        // Back after a refresh: carry on as the same player
        if (message.type === MessageTypeClient.REJOIN_LOBBY) {
            const found =
                typeof message.data?.code === "string"
                    ? findLobby(message.data.code)
                    : undefined;
            const token = message.data?.token;
            const player =
                found && typeof token === "string" && token
                    ? Array.from(found.players.values()).find(
                          (candidate) => candidate.rejoinToken === token,
                      )
                    : undefined;

            if (!found || !player) {
                sendError("That game has ended");
                return;
            }

            // Only the player's own tab (after a refresh) may replace a live
            // connection; another tab can't become someone who's still here
            if (player.connected !== false && message.data?.takeover !== true) {
                sendError("That player is still in the game");
                return;
            }

            lobby = found;
            playerId = player.id;
            handleRejoin(socket, lobby, player);
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

    // Their place is held for a while in case they come back (a refresh)
    socket.on("close", () => {
        if (lobby) {
            handleDisconnect(playerId, lobby, socket);
        }
    });

    // Notice connections that died without closing (a laptop lid, a lost
    // network): no answer to a ping means they're gone
    let alive = true;
    socket.on("pong", () => (alive = true));
    const heartbeat = setInterval(() => {
        if (!alive) {
            socket.terminate();
            return;
        }
        alive = false;
        socket.ping();
    }, HEARTBEAT_MS);
    socket.on("close", () => clearInterval(heartbeat));

    // Without a listener, a socket error would crash the server
    socket.on("error", (error) => {
        console.warn(`Socket error for ${playerId}:`, error.message);
    });
});
