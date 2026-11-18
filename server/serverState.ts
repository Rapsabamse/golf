import { BallLocation, GameState, Player } from "./types/types";

/** What one client reported while simulating a round. */
export interface SimulationReport {
    goals: Set<string>;
    locations?: BallLocation[];
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
    /** Which hole of the current game is being played (0 = first hole). */
    holeIndex: number;
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
}

export function createServerContext(code = ""): ServerContext {
    return {
        code,
        players: new Map(),
        gameState: GameState.WAITING,
        hostId: undefined,
        holeIndex: 0,
        ballLocations: [],
        playersReady: new Set(),
        simulationReports: new Map(),
        mapLoaded: new Set(),
        holeMaxShots: [],
    };
}
