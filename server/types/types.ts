import { WebSocket } from "ws";

/**
 * The holes in play order, from the warm-up to the hardest. Shared by the
 * server (which decides which hole is being played) and the client (which
 * loads the map with that name from public/assets/maps).
 *   map1 Warm-up · map2 Dogleg · map3 Pinball · map4 Switchback · map5 Orbit
 */
export const MAPS = ["map1", "map2", "map3", "map4", "map5"];

/**
 * Fastest shot the server accepts. Matches the client's aim limit
 * (maxForce 160 * forceMultiplier 0.25 in Controller.ts).
 */
export const MAX_SHOT_SPEED = 40;

export enum MessageTypeClient {
    START_GAME,
    READY,
    SIMULATION_DONE,
    SHOT_SELECTED,
    PLAYER_GOAL,
    LOADED_NEW_MAP,
    NAME,
    /** Host starts a new game from the final scores. */
    PLAY_AGAIN,
    /** First message: make a new lobby. Data: { name, catchphrase? }. */
    HOST_LOBBY,
    /** First message: join a lobby. Data: { code, name, catchphrase? }. */
    JOIN_LOBBY,
}

export enum MessageTypeServer {
    PLAYER_LIST,
    CONNECTED,
    GAME_STATE,
    SHOT_SELECTION_CONFIRMATION,
    /** Couldn't host or join. Data: { error }. */
    LOBBY_ERROR,
}

export enum GameState {
    WAITING,
    PLANNING,
    SIMULATING,
    SIMULATING_HOST,
    ROUND_COMPLETE,
    /** The last hole is done: final scores until the host plays again. */
    GAME_OVER,
}

export interface Vector {
    x: number;
    y: number;
}

export interface Player {
    id: string;
    name: string;
    /** Ball colour, e.g. 0xff5252. Unique within the game. */
    color?: number;
    /** Shown over the hole when this player's ball drops in. */
    catchphrase?: string;
    /** Has locked in a shot this planning phase. */
    ready?: boolean;
    socket?: WebSocket;
    state?: PlayerState;
    roundState?: RoundState;
    shot?: PlayerShot;
    waitingForNextRound?: boolean;
}

export interface PlayerState {
    /**
     * Shots taken per hole, indexed by hole number. A hole the player
     * didn't play (e.g. they joined later) is null.
     */
    points: (number | null)[];
    /**
     * Holes the player missed by joining late. Their score there is the most
     * shots anyone needed on that hole.
     */
    missedHoles?: number[];
}

export interface RoundState {
    shots: number;
    hasScored: boolean;
}

export interface PlayerShot {
    direction: Vector;
}

export interface ServerMessageData {
    type: MessageTypeServer;
    data?: ServerData;
}

export interface ServerData {
    state?: GameState;
    playerId?: string;
    playerList?: Player[];
    ballLocations?: BallLocation[];
    scoringPlayers?: string[];
    isHost?: boolean;
    shouldWait?: boolean;
    hostId?: string | undefined;
    /** The map everyone should be on (or, for ROUND_COMPLETE, the next map). */
    mapName?: string;
    /** Hole number (1-based) that goes with mapName. */
    hole?: number;
    /** The lobby's code, sent with GAME_STATE. */
    lobbyCode?: string;
    /** Why hosting or joining failed (LOBBY_ERROR). */
    error?: string;
    /** Sent to someone joining a game in progress, so they can watch it. */
    courseState?: CourseState;
}

/** Where things stand on the course right now. */
export interface CourseState {
    /** Players taking part in this hole, in spawn order. */
    players: Player[];
    /** Where each ball stopped after the last shot (empty before the first shot). */
    ballLocations: BallLocation[];
    /** Players who have already holed out. */
    scoringPlayers: string[];
}

export interface BallLocation {
    playerId: string;
    x: number;
    y: number;
}

/**
 * For players who don't pick their own catchphrase. The menu offers one as
 * the field's placeholder; the server picks one if none is sent.
 */
export const DEFAULT_CATCHPHRASES = [
    "In the hole!",
    "Sunk it!",
    "Nothing but cup!",
    "Get in the hole!",
    "Called it!",
    "Too easy!",
    "Pure putt!",
    "Down it goes!",
    "Like a pro!",
    "Bullseye!",
];
