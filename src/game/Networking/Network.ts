import {
    Player,
    MessageTypeServer,
    GameState,
    MessageTypeClient,
} from "../../../server/types/types";

export class Network {
    private socket!: WebSocket;
    private playerId!: string;
    private players: Player[] = [];
    private gameState: GameState;

    onPlayerList?: (players: Player[]) => void;
    onGameStateChange?: (gamestate: GameState, data?: any) => void;

    connect() {
        this.socket = new WebSocket("ws://localhost:8090");

        this.socket.onopen = () => {
            console.log("Connected to server");
        };

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);

            console.log(message);

            if (message.type === MessageTypeServer.CONNECTED) {
                this.playerId = message.playerId;
            }

            if (message.type === MessageTypeServer.PLAYER_LIST) {
                this.players = message.players;
                this.onPlayerList?.(this.players);
            }

            if (message.type === MessageTypeServer.GAME_STATE) {
                this.gameState = message.state;
                this.onGameStateChange?.(this.gameState, message.data);
            }
        };

        this.socket.onclose = () => {
            console.log("Disconnected from server");
        };
    }

    send(message: object) {
        this.socket.send(JSON.stringify(message));
    }

    ready() {
        this.send({
            type: MessageTypeClient.READY,
        });
    }

    sendShot(direction: Phaser.Math.Vector2) {
        this.send({
            type: MessageTypeClient.SHOT_SELECTED,
            data: direction,
        });
    }

    getPlayerId() {
        return this.playerId;
    }

    getPlayers(): Player[] {
        return this.players;
    }

    isLobbyWaiting(): Boolean {
        return this.gameState === GameState.WAITING;
    }

    isLobbyPlanning(): Boolean {
        return this.gameState === GameState.PLANNING;
    }

    isLobbySimulating(): Boolean {
        return this.gameState === GameState.SIMULATING;
    }

    startGame() {
        this.socket.send(
            JSON.stringify({
                type: MessageTypeClient.START_GAME,
            }),
        );
    }
}
