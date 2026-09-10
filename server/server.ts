import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { BallLocation, GameState as GameState, Player } from "./types/types";
import { handleMessages } from "./handlers/messageHandler";
import { handleConnection } from "./handlers/connectionHandler";
import { handleClose } from "./handlers/closeHandler";

const PORT = Number(process.env.PORT) || 8090;

const wss = new WebSocketServer({
    port: PORT,
});

const players = new Map<string, Player>();
let gameState = GameState.WAITING;
let hostId: string | undefined;
let ballLocations: BallLocation[] = [];
const playersReady = new Set<string>();

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
            getScoringPlayers,
            playersReady,
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

function setHostId(id: string | undefined) {
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

function getScoringPlayers() {
    let scoredPlayersList: string[] = [];
    players.forEach((player) => {
        if (player.roundState?.hasScored) {
            scoredPlayersList.push(player.id);
        }
    });

    console.log(scoredPlayersList);

    return scoredPlayersList;
}
