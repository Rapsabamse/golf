import {
    Player,
    MessageTypeServer,
    GameState,
    MessageTypeClient,
    ServerMessageData,
    ServerData,
    BallLocation,
    Vector,
    DEFAULT_COURSE_ID,
    ShotStats,
} from "../../../server/types/types";
import { RejoinStore, SavedSession } from "./RejoinStore";

/** How often the saved rejoin key is marked as recent while connected. */
const KEEP_SESSION_MS = 5000;

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
    private courseId = DEFAULT_COURSE_ID;
    /** Saved games still to try when rejoining, after the current attempt. */
    private rejoinQueue?: SavedSession[];
    private rejoinAttempt?: SavedSession;
    private rejoinEnded = false;
    private keepSessionTimer?: ReturnType<typeof setInterval>;

    onPlayerList?: (players: Player[], self: Player | undefined) => void;
    onGameStateChange?: (gamestate: GameState, data?: ServerData) => void;
    onReadyConfirmed?: () => void;

    /** The server put us in a lobby. */
    onLobbyJoined?: () => void;
    /** Hosting or joining failed, or the server can't be reached. */
    onLobbyError?: (error: string) => void;
    /** Rejoining didn't work; ended is true if the game had ended. */
    onRejoinFailed?: (ended: boolean) => void;
    /** The connection dropped mid-game. */
    onConnectionLost?: () => void;

    /** Make a new lobby with its own code. An empty catchphrase gets a random one. */
    host(playerName: string, catchphrase: string) {
        this.request({
            type: MessageTypeClient.HOST_LOBBY,
            data: { name: playerName, catchphrase },
        });
    }

    /** Join the lobby with this code. */
    join(code: string, playerName: string, catchphrase: string) {
        this.request({
            type: MessageTypeClient.JOIN_LOBBY,
            data: { code, name: playerName, catchphrase },
        });
    }

    /**
     * Rejoin a game this browser was in (after a refresh or a closed tab),
     * trying each saved one in turn.
     */
    rejoin(sessions: SavedSession[]) {
        this.rejoinQueue = [...sessions];
        this.rejoinEnded = false;
        this.tryNextRejoin();
    }

    private tryNextRejoin() {
        const next = this.rejoinQueue?.shift();
        this.rejoinAttempt = next;

        if (!next) {
            this.rejoinQueue = undefined;
            this.onRejoinFailed?.(this.rejoinEnded);
            return;
        }

        this.request({
            type: MessageTypeClient.REJOIN_LOBBY,
            data: { code: next.code, token: next.token, takeover: next.takeover },
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
            clearInterval(this.keepSessionTimer);

            if (this.joined) {
                this.onConnectionLost?.();
                return;
            }

            this.socket = undefined;

            if (this.rejoinQueue) {
                this.rejoinQueue = undefined;
                this.onRejoinFailed?.(false);
                return;
            }

            this.onLobbyError?.("Can't reach the game server. Is it running?");
        };
    }

    /**
     * Keep the key to rejoin as this player if the page is refreshed or
     * closed, marked as recent for as long as we're connected.
     */
    private rememberSession(token?: string) {
        if (!token) {
            return;
        }

        const save = () => RejoinStore.save(this.lobbyCode, token);
        save();

        clearInterval(this.keepSessionTimer);
        this.keepSessionTimer = setInterval(save, KEEP_SESSION_MS);
        window.addEventListener("pagehide", save);
    }

    private handleLobbyMessage(message: ServerMessageData) {
        if (message.type === MessageTypeServer.LOBBY_ERROR) {
            // Rejoining: that saved game is no good, try the next one
            if (this.rejoinQueue) {
                if (this.rejoinAttempt) {
                    RejoinStore.forget(this.rejoinAttempt.token);
                }
                this.rejoinEnded ||= message.data?.error === "That game has ended";
                this.tryNextRejoin();
                return;
            }

            this.onLobbyError?.(message.data?.error ?? "Couldn't join that game");
            return;
        }

        if (
            message.type === MessageTypeServer.CONNECTED &&
            message.data?.playerId
        ) {
            this.joined = true;
            this.rejoinQueue = undefined;
            this.playerId = message.data.playerId;
            this.lobbyCode = message.data.lobbyCode ?? "";
            this.rememberSession(message.data.rejoinToken);
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

                if (message.data.courseId) {
                    this.courseId = message.data.courseId;
                }
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
    /** steps: how long the simulation ran (moves the obstacles on). */
    /**
     * Where the balls stopped, and the shots that didn't go in (any of them
     * might be the shot of the hole).
     */
    sendSimulationResult(
        balls: BallLocation[],
        steps: number,
        shots: { playerId: string; shot: ShotStats }[] = [],
    ) {
        this.send({
            type: MessageTypeClient.SIMULATION_DONE,
            data: { locations: balls, steps, shots },
        });
    }

    /** Host only: pick the course in the lobby. */
    selectCourse(courseId: string) {
        this.send({ type: MessageTypeClient.SELECT_COURSE, data: courseId });
    }

    getCourseId() {
        return this.courseId;
    }

    /** A ball went in. The shot goes along in case it's the shot of the hole. */
    sendGoalReached(playerId: string, shot?: ShotStats) {
        this.send({
            type: MessageTypeClient.PLAYER_GOAL,
            data: shot ? { playerId, shot } : playerId,
        });
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
