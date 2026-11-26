/**
 * Each music track's colours, shared by the floor under the course and the
 * course lighting, so everything on screen matches the song that's playing.
 */
export interface TrackTheme {
    /** The neon trim along the tops of the walls. */
    rim: number;
    /** The cup's glow. */
    glow: number;
    /** The room's light falling on the course (a soft tint). */
    mood: number;
}

export const TRACK_THEMES: Record<string, TrackTheme> = {
    disco: { rim: 0xff4fd8, glow: 0xffd24a, mood: 0xcdaaf2 },
    synthwave: { rim: 0xff3fa4, glow: 0x3ff0ff, mood: 0xf2aad8 },
    eurobeat: { rim: 0x3fd6ff, glow: 0xffffff, mood: 0xaac4f2 },
};

/** The theme for a track, if it has one. */
export function getTrackTheme(track: string | undefined): TrackTheme | undefined {
    return track ? TRACK_THEMES[track] : undefined;
}
