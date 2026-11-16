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
    private socket!: WebSocket;
    private playerId!: string;
    private players: Player[] = [];
    private gameState: GameState;
    private isHost = false;
    private hostId?: string;

    onPlayerList?: (players: Player[], self: Player | undefined) => void;
    onGameStateChange?: (gamestate: GameState, data?: ServerData) => void;
    onReadyConfirmed?: () => void;

    connect(playerName: string) {
        this.socket = new WebSocket(WS_URL);

        this.socket.onopen = () => {
            console.log("Connected to server");

            this.send({
                type: MessageTypeClient.NAME,
                data: playerName,
            });
        };

        this.socket.onmessage = (event) => {
            let message: ServerMessageData;
            try {
                message = JSON.parse(event.data);
            } catch {
                console.warn("Ignoring invalid message from server");
                return;
            }

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
        };

        this.socket.onclose = () => {
            console.log("Disconnected from server");
        };
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
}
