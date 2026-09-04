import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { BallLocation, GameState as GameState, Player } from "./types/types";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection } from "./handlers/connectionHandler";
import { handleClose } from "./handlers/closeHandler";

const PORT = 8090;

const wss = new WebSocketServer({
    port: PORT,
});

const players = new Map<string, Player>();
let gameState = GameState.WAITING;
let hostId: string | undefined;
let ballLocations: BallLocation[] = [];

console.log(`WebSocket server running on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
    const playerId = randomUUID();

    handleConnection(
        socket,
        players,
        gameState,
        playerId,
        setHostId,
        getHostId,
    );

    socket.on("message", (data) => {
        handleMessages(
            playerId,
            data,
            gameState,
            players,
            setGamestate,
            getHostId,
            setBallLocations,
            getBallLocations,
        );
    });

    socket.on("close", () => {
        handleClose(
            playerId,
            players,
            gameState,
            setGamestate,
            setHostId,
            getHostId,
        );
    });
});

function setGamestate(newGamestate: GameState) {
    gameState = newGamestate;
}

function setHostId(id: string) {
    hostId = id;
    console.log(`Set new host. Id: `, id);
}

function getHostId() {
    return hostId;
}

function getBallLocations() {
    return ballLocations;
}

function setBallLocations(newBallLocations: BallLocation[]) {
    ballLocations = newBallLocations;
}
