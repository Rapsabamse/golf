import {
    Player,
    MessageTypeServer,
    GameState,
    MessageTypeClient,
    ServerMessageData,
} from "../../../server/types/types";

export class Network {
    private socket!: WebSocket;
    private playerId!: string;
    private players: Player[] = [];
    private gameState: GameState;

    onPlayerList?: (players: Player[]) => void;
    onGameStateChange?: (gamestate: GameState, data?: any) => void;

    connect(playerName: string) {
        this.socket = new WebSocket("ws://localhost:8090");

        this.socket.onopen = () => {
            console.log("Connected to server");

            this.send({
                type: MessageTypeClient.NAME,
                data: playerName,
            });
        };

        this.socket.onmessage = (event) => {
            const message: ServerMessageData = JSON.parse(event.data);

            if (message.data === undefined) {
                return;
            }

            if (message.type === MessageTypeServer.CONNECTED) {
                if (message.data.playerId) {
                    this.playerId = message.data.playerId;
                }
            }

            if (message.type === MessageTypeServer.PLAYER_LIST) {
                if (message.data.playerList) {
                    this.players = message.data.playerList;
                    this.onPlayerList?.(this.players);
                }
            }

            if (message.type === MessageTypeServer.GAME_STATE) {
                if (message.data.state != undefined) {
                    this.gameState = message.data.state;
                    this.onGameStateChange?.(this.gameState, message.data);
                }
            }
        };

        this.socket.onclose = () => {
            console.log("Disconnected from server");
        };
    }

    send(message: object) {
        this.socket.send(JSON.stringify(message));
    }

    sendReady() {
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

    sendMapLoaded() {
        this.send({ type: MessageTypeClient.LOADED_NEW_MAP });
    }

    sendSimulationResult(balls: { playerId: string; x: number; y: number }[]) {
        this.send({ type: MessageTypeClient.SIMULATION_DONE, data: balls });
    }

    sendSimulationDone() {
        this.send({ type: MessageTypeClient.SIMULATION_DONE });
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
