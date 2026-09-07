import { WebSocket } from "ws";

export enum MessageTypeClient {
    START_GAME,
    READY,
    SIMULATION_DONE,
    SHOT_SELECTED,
    PLAYER_GOAL,
    LOADED_NEW_MAP,
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
    ROUND_COMPLETE,
}

export interface Player {
    id: string;
    socket?: WebSocket;
    state?: PlayerState;
    roundState?: RoundState;
    shot?: PlayerShot;
    waitingForNextRound?: boolean;
}

export interface PlayerState {
    points: number[];
}

export interface RoundState {
    position?: Phaser.Math.Vector2;
    shots: number;
    hasScored: boolean;
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
    scoringPlayers?: string[];
}

export interface BallLocation {
    playerId: string;
    x: number;
    y: number;
}
