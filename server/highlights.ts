import { ServerContext } from "./serverState";
import {
    MAX_HIGHLIGHT_POINTS,
    Player,
    ShotHighlight,
    ShotStats,
} from "./types/types";

/** Points further out than this aren't on any course. */
const MAX_COORDINATE = 20000;
const MAX_COUNT = 99;

/**
 * Points for one shot. A good shot is one that brings the ball closest to
 * the hole; walls, tunnels, jumps and the rest are a bonus on top, and a
 * hole in one is best of all. Every shot on a hole is scored and the one
 * with the most points is its shot of the hole, so there's always one.
 * Doing the same thing again is worth more each time.
 */
export const POINTS = {
    /** Per 100 px closer to the cup than where it was hit from. */
    per100Closer: 4,
    /** Stopping within FINISH_RANGE of the cup: the full amount at the cup. */
    finishClose: 10,
    /** Going in at all (it already got the full finishClose). */
    sunk: 5,
    holeInOne: 60,
    /** The first wall is worth this, the second twice this, and so on. */
    bounceStep: 3,
    /** The first tunnel or jump; each one after that is worth more. */
    firstTunnel: 15,
    firstJump: 15,
    extraTunnelOrJump: 20,
    /** Both a tunnel and a jump in one shot. */
    tunnelAndJump: 10,
    /** Rolled over the cup. */
    lipOut: 8,
    /** Knocked another ball on the way. */
    ballHit: 8,
};

/** Stopping this close (px) to the cup earns some of finishClose. */
export const FINISH_RANGE = 200;

/** Bounces past this don't add more (a ball rattling in a corner). */
const MAX_SCORED_BOUNCES = 10;

/** The shot sent with a goal, or undefined if it isn't a valid one. */
export function parseShotStats(data: unknown): ShotStats | undefined {
    if (!data || typeof data !== "object") {
        return undefined;
    }

    const shot = data as Record<string, unknown>;
    const path = shot.path;

    if (
        !Array.isArray(path) ||
        path.length < 6 ||
        path.length % 3 !== 0 ||
        path.length > MAX_HIGHLIGHT_POINTS * 3
    ) {
        return undefined;
    }

    const points: number[] = [];

    for (let i = 0; i < path.length; i += 3) {
        const x = path[i];
        const y = path[i + 1];
        const kind = path[i + 2];

        if (
            typeof x !== "number" ||
            typeof y !== "number" ||
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            Math.abs(x) > MAX_COORDINATE ||
            Math.abs(y) > MAX_COORDINATE ||
            (kind !== 0 && kind !== 1 && kind !== 2)
        ) {
            return undefined;
        }

        points.push(Math.round(x), Math.round(y), kind);
    }

    return {
        path: points,
        bounces: parseCount(shot.bounces),
        tunnels: parseCount(shot.tunnels),
        jumps: parseCount(shot.jumps),
        lipOuts: parseCount(shot.lipOuts),
        ballHits: parseCount(shot.ballHits),
        startToCup: parseDistance(shot.startToCup),
        endToCup: parseDistance(shot.endToCup),
    };
}

function parseCount(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(MAX_COUNT, Math.floor(value)));
}

function parseDistance(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(MAX_COORDINATE, Math.round(value)));
}

/** Distance along the path, not counting the jump through a tunnel. */
export function getPathLength(path: number[]): number {
    let length = 0;

    for (let i = 3; i < path.length; i += 3) {
        if (path[i + 2] === 2) {
            continue;
        }

        length += Math.hypot(path[i] - path[i - 3], path[i + 1] - path[i - 2]);
    }

    return length;
}

export function scoreHighlight(highlight: ShotHighlight): number {
    const startToCup = highlight.startToCup ?? 0;
    const endToCup = highlight.sunk ? 0 : (highlight.endToCup ?? startToCup);
    const bounces = Math.min(highlight.bounces, MAX_SCORED_BOUNCES);
    const tunnels = highlight.tunnels;
    const jumps = highlight.jumps;

    // How much closer it got (going further away earns nothing)
    let points =
        (Math.max(0, startToCup - endToCup) / 100) * POINTS.per100Closer;

    // And how close it ended up
    points +=
        (Math.max(0, FINISH_RANGE - endToCup) / FINISH_RANGE) *
        POINTS.finishClose;

    if (highlight.sunk) {
        points += POINTS.sunk;

        if (highlight.shotNumber === 1) {
            points += POINTS.holeInOne;
        }
    }

    // 1st wall 3, 2nd 6, 3rd 9...: 3 + 6 + 9 for three
    points += (POINTS.bounceStep * bounces * (bounces + 1)) / 2;

    if (tunnels > 0) {
        points += POINTS.firstTunnel + (tunnels - 1) * POINTS.extraTunnelOrJump;
    }
    if (jumps > 0) {
        points += POINTS.firstJump + (jumps - 1) * POINTS.extraTunnelOrJump;
    }
    if (tunnels > 0 && jumps > 0) {
        points += POINTS.tunnelAndJump;
    }

    points += (highlight.lipOuts ?? 0) * POINTS.lipOut;
    points += (highlight.ballHits ?? 0) * POINTS.ballHit;

    return points;
}

/**
 * A player took this shot: keep it if it has the most points on the hole
 * so far. On a tie the earlier shot stays.
 */
export function considerHighlight(
    ctx: ServerContext,
    player: Player,
    shotNumber: number,
    shot: ShotStats,
    sunk: boolean,
) {
    const highlight: ShotHighlight = {
        ...shot,
        playerId: player.id,
        name: player.name,
        color: player.color,
        catchphrase: player.catchphrase,
        shotNumber,
        length: Math.round(getPathLength(shot.path)),
        sunk,
    };

    highlight.points = Math.round(scoreHighlight(highlight));

    const best = ctx.holeHighlight;

    if (!best || highlight.points > (best.points ?? 0)) {
        ctx.holeHighlight = highlight;
    }
}
