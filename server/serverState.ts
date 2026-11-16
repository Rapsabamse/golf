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
}

export function createServerContext(): ServerContext {
    return {
        players: new Map(),
        gameState: GameState.WAITING,
        hostId: undefined,
        holeIndex: 0,
        ballLocations: [],
        playersReady: new Set(),
        simulationReports: new Map(),
        mapLoaded: new Set(),
    };
}
