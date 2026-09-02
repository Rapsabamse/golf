import { WebSocket } from "ws";

export interface Player {
    id: string;
    socket: WebSocket;
    ready: boolean;
}

export enum MessageTypes {
    PLAYER_LIST,
    CONNECTED,
    START_GAME,
    GAME_STATE,
}

export enum GameStates {
    WAITING,
    PLANNING,
    SIMULATING,
}
