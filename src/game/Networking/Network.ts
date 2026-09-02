import { Player, MessageTypes, GameStates } from "../../../server/types/types";

export class Network {
    private socket!: WebSocket;
    private playerId!: string;
    private players: Player[] = [];
    private gameState: GameStates;

    onPlayerList?: (players: Player[]) => void;
    onGameStateChange?: (gamestate: GameStates) => void;

    connect() {
        this.socket = new WebSocket("ws://localhost:8090");

        this.socket.onopen = () => {
            console.log("Connected to server");
        };

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);

            if (message.type === MessageTypes.CONNECTED) {
                this.playerId = message.playerId;
            }

            if (message.type === MessageTypes.PLAYER_LIST) {
                this.players = message.players;
                this.onPlayerList?.(this.players);
            }

            if (message.type === MessageTypes.GAME_STATE) {
                this.gameState = message.state;
                this.onGameStateChange?.(this.gameState);
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
            type: "READY",
        });
    }

    getPlayerId() {
        return this.playerId;
    }

    getPlayers(): Player[] {
        return this.players;
    }

    isLobbyWaiting(): Boolean {
        return this.gameState === GameStates.WAITING;
    }

    isLobbyPlanning(): Boolean {
        return this.gameState === GameStates.PLANNING;
    }

    isLobbySimulating(): Boolean {
        return this.gameState === GameStates.SIMULATING;
    }

    startGame() {
        this.socket.send(
            JSON.stringify({
                type: MessageTypes.START_GAME,
            }),
        );
    }
}
