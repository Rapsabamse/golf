import { WebSocket } from "ws";

export enum MessageTypeClient {
    START_GAME,
    READY,
    SIMULATION_DONE,
    SHOT_SELECTED,
}

export enum MessageTypeServer {
    PLAYER_LIST,
    CONNECTED,
    GAME_STATE,
}

export enum GameState {
    WAITING,
    PLANNING,
    SIMULATING,
    SIMULATING_HOST,
}

export interface Player {
    id: string;
    socket: WebSocket;
    ready: boolean;
    finishedSimulating: boolean;
    state: PlayerState;
    roundState?: RoundState;
    shot?: PlayerShot;
}

export interface PlayerState {
    points: number;
}

export interface RoundState {
    position: Phaser.Math.Vector2;
    shots: number;
}

export interface PlayerShot {
    direction: Phaser.Math.Vector2;
}

export interface ServerMessageData {
    type: MessageTypeServer;
    data?: ServerData;
}

export interface ServerData {
    state?: GameState;
    playerData?: Map<string, Player>;
    playerId?: string;
    playerList?: Player[];
    ballLocations?: BallLocation[];
}

export interface BallLocation {
    playerId: string;
    x: number;
    y: number;
}
