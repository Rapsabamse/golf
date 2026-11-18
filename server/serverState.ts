import {
    BallLocation,
    DEFAULT_COURSE_ID,
    GameState,
    Player,
    ShotHighlight,
    ShotStats,
} from "./types/types";

export interface ShotReport {
    playerId: string;
    shot: ShotStats;
}

/** What one client reported while simulating a round. */
export interface SimulationReport {
    goals: Set<string>;
    /** What each of those putts looked like, for the shot of the hole. */
    goalShots?: Map<string, ShotStats>;
    locations?: BallLocation[];
    /** Physics steps the simulation took (moves the obstacles on). */
    steps?: number;
    /** The shots that didn't go in, for the shot of the hole. */
    shots?: ShotReport[];
}

/**
 * Everything the server knows about the current game, in one place so the
 * handlers can read and change it without a long list of getters and setters.
 */
export interface ServerContext {
    /** The 4-letter code players join this lobby with. */
    code: string;
    players: Map<string, Player>;
    gameState: GameState;
    hostId: string | undefined;
    /** The course picked in the lobby. */
    courseId: string;
    /** Which hole of the current game is being played (0 = first hole). */
    holeIndex: number;
    /** How far this hole's moving obstacles have run, in physics steps. */
    courseTime: number;
    ballLocations: BallLocation[];
    playersReady: Set<string>;
    /**
     * Results from every client for the running simulation. Only the host's
     * result is used, but the others are kept in case the host disconnects
     * mid-simulation and someone else has to take over.
     */
    simulationReports: Map<string, SimulationReport>;
    /** Players who finished loading the next map after a round. */
    mapLoaded: Set<string>;
    /**
     * Most shots anyone needed on each hole, indexed by hole number. Late
     * joiners get this score for the holes they missed.
     */
    holeMaxShots: number[];
    /** When the current shot's clock runs out (server time), while aiming. */
    shotClockEndsAt?: number;
    shotClockTimer?: ReturnType<typeof setTimeout>;
    /**
     * The shots being simulated, kept so a host who refreshes mid-shot can
     * be sent them again.
     */
    currentShots?: Pick<Player, "id" | "shot">[];
    /** The best putt on this hole so far, replayed when it ends. */
    holeHighlight?: ShotHighlight;
}

export function createServerContext(code = ""): ServerContext {
    return {
        code,
        players: new Map(),
        gameState: GameState.WAITING,
        hostId: undefined,
        courseId: DEFAULT_COURSE_ID,
        holeIndex: 0,
        courseTime: 0,
        ballLocations: [],
        playersReady: new Set(),
        simulationReports: new Map(),
        mapLoaded: new Set(),
        holeMaxShots: [],
    };
}
