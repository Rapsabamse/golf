import {
    Player,
    MessageTypeServer,
    GameState,
    MessageTypeClient,
    ServerMessageData,
    ServerData,
    BallLocation,
    Vector,
} from "../../../server/types/types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8090";

export class Network {
    private socket?: WebSocket;
    private playerId!: string;
    private lobbyCode = "";
    /** In a lobby: the server accepted our host or join request. */
    private joined = false;
    /**
     * After joining, messages wait here until the game scene is listening
     * (resume), so nothing sent while the scene starts is missed.
     */
    private paused = true;
    private queue: ServerMessageData[] = [];
    private pendingRequest?: object;
    private players: Player[] = [];
    private gameState: GameState;
    private isHost = false;
    private hostId?: string;

    onPlayerList?: (players: Player[], self: Player | undefined) => void;
    onGameStateChange?: (gamestate: GameState, data?: ServerData) => void;
    onReadyConfirmed?: () => void;

    /** The server put us in a lobby. */
    onLobbyJoined?: () => void;
    /** Hosting or joining failed, or the server can't be reached. */
    onLobbyError?: (error: string) => void;

    /** Make a new lobby with its own code. */
    host(playerName: string) {
        this.request({
            type: MessageTypeClient.HOST_LOBBY,
            data: { name: playerName },
        });
    }

    /** Join the lobby with this code. */
    join(code: string, playerName: string) {
        this.request({
            type: MessageTypeClient.JOIN_LOBBY,
            data: { code, name: playerName },
        });
    }

    /** Start handling game messages (and any that arrived while paused). */
    resume() {
        this.paused = false;

        for (const message of this.queue.splice(0)) {
            this.handleMessage(message);
        }
    }

    getLobbyCode() {
        return this.lobbyCode;
    }

    /** Send a host or join request, connecting first if needed. */
    private request(message: object) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.send(message);
            return;
        }

        this.pendingRequest = message;

        if (this.socket?.readyState === WebSocket.CONNECTING) {
            return;
        }

        this.socket = new WebSocket(WS_URL);

        this.socket.onopen = () => {
            console.log("Connected to server");

            if (this.pendingRequest) {
                this.send(this.pendingRequest);
                this.pendingRequest = undefined;
            }
        };

        this.socket.onmessage = (event) => {
            let message: ServerMessageData;
            try {
                message = JSON.parse(event.data);
            } catch {
                console.warn("Ignoring invalid message from server");
                return;
            }

            if (!this.joined) {
                this.handleLobbyMessage(message);
            } else if (this.paused) {
                this.queue.push(message);
            } else {
                this.handleMessage(message);
            }
        };

        this.socket.onclose = () => {
            console.log("Disconnected from server");

            if (!this.joined) {
                this.socket = undefined;
                this.onLobbyError?.("Can't reach the game server. Is it running?");
            }
        };
    }

    private handleLobbyMessage(message: ServerMessageData) {
        if (message.type === MessageTypeServer.LOBBY_ERROR) {
            this.onLobbyError?.(message.data?.error ?? "Couldn't join that game");
            return;
        }

        if (
            message.type === MessageTypeServer.CONNECTED &&
            message.data?.playerId
        ) {
            this.joined = true;
            this.playerId = message.data.playerId;
            this.lobbyCode = message.data.lobbyCode ?? "";
            this.onLobbyJoined?.();
        }
    }

    private handleMessage(message: ServerMessageData) {
        {
            // Host status can move to another player when the host leaves
            if (message.data?.hostId !== undefined) {
                this.hostId = message.data.hostId;
                this.isHost = message.data.hostId === this.playerId;
            } else if (typeof message.data?.isHost === "boolean") {
                this.isHost = message.data.isHost;
            }

            if (
                message.type === MessageTypeServer.SHOT_SELECTION_CONFIRMATION
            ) {
                this.onReadyConfirmed?.();
            }

            if (message.data === undefined) {
                return;
            }

            if (
                message.type === MessageTypeServer.CONNECTED &&
                message.data.playerId
            ) {
                this.playerId = message.data.playerId;
            }

            if (
                message.type === MessageTypeServer.PLAYER_LIST &&
                message.data.playerList
            ) {
                this.players = message.data.playerList;

                const self = this.players.find(
                    (player) => player.id === this.playerId,
                );

                this.onPlayerList?.(this.players, self);
            }

            if (
                message.type === MessageTypeServer.GAME_STATE &&
                message.data.state !== undefined
            ) {
                this.gameState = message.data.state;
                this.onGameStateChange?.(this.gameState, message.data);
            }
        }
    }

    send(message: object) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    sendReady() {
        this.send({
            type: MessageTypeClient.READY,
        });
    }

    sendShot(direction: Vector) {
        this.send({
            type: MessageTypeClient.SHOT_SELECTED,
            data: { x: direction.x, y: direction.y },
        });
    }

    sendMapLoaded() {
        this.send({ type: MessageTypeClient.LOADED_NEW_MAP });
    }

    /**
     * Every client reports where the balls stopped. Only the host's result is
     * used, but the server keeps the others in case the host leaves mid-shot.
     */
    sendSimulationResult(balls: BallLocation[]) {
        this.send({ type: MessageTypeClient.SIMULATION_DONE, data: balls });
    }

    sendGoalReached(playerId: string) {
        this.send({ type: MessageTypeClient.PLAYER_GOAL, data: playerId });
    }

    getPlayerId() {
        return this.playerId;
    }

    getPlayers(): Player[] {
        return this.players;
    }

    isLobbyWaiting(): boolean {
        return this.gameState === GameState.WAITING;
    }

    isLobbyPlanning(): boolean {
        return this.gameState === GameState.PLANNING;
    }

    isLobbySimulating(): boolean {
        return (
            this.gameState === GameState.SIMULATING ||
            this.gameState === GameState.SIMULATING_HOST
        );
    }

    getGameState(): GameState {
        return this.gameState;
    }

    getIsHost(): boolean {
        return this.isHost;
    }

    getHostId(): string | undefined {
        return this.hostId;
    }

    startGame() {
        this.send({
            type: MessageTypeClient.START_GAME,
        });
    }

    /** Host only: start a new game from the final scores. */
    playAgain() {
        this.send({ type: MessageTypeClient.PLAY_AGAIN });
    }
}
