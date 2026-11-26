import { SoundEffects } from "./SoundEffects";

/**
 * The battle music: three tracks (made by tools/music), played in a
 * random order during matches. When a track ends, a different one picked
 * at random fades in over it; the same track never plays twice in a row.
 *
 * Each track comes in parts that are played one after another, so only
 * the part playing and the next one are decoded in memory. Each part's
 * file has half a second of its neighbours before and after it: a part
 * starts from its padding and plays exactly its own length, so parts of a
 * track join without a gap (a tiny crossfade hides any rounding).
 */
const MUSIC_FOLDER = "assets/audio/";
const MANIFEST_URL = MUSIC_FOLDER + "music.json";

/** Under the sound effects, which play at 0.6. */
const VOLUME = 0.32;
const FADE_IN = 1.5;
const FADE_OUT = 0.6;
/** Overlap between parts of a track, in seconds (well inside the padding). */
const PART_JOIN = 0.02;
/** One track fades into the next over this long. */
const TRACK_CROSSFADE = 4;
/** Schedule the next part this long before it's due. */
const LOOKAHEAD = 6;

/** Whether the player wants music, remembered between visits. */
const STORAGE_KEY = "golf.music";

interface Track {
    id: string;
    title: string;
    /** Tempo, so the game can move in time with it. */
    bpm?: number;
    sampleRate: number;
    /** Samples of padding at each end of every part's file. */
    pad: number;
    parts: { file: string; samples: number }[];
}

interface Manifest {
    tracks: Track[];
}

/** Where we are in the music. */
interface Position {
    track: number;
    part: number;
}

/** How a part begins: from silence, joined to the last part, or fading in over the last track. */
type Entry = "start" | "join" | "crossfade";

interface Playback {
    context: AudioContext;
    /** The music's own volume, for fading in and out. */
    output: GainNode;
    sources: AudioBufferSourceNode[];
    /** The part playing now, and the next one and when it starts. */
    current: Position;
    next: Position;
    nextEntry: Entry;
    nextStart: number;
    timer?: ReturnType<typeof setTimeout>;
    /** Listens to what's playing, for the visuals. */
    analyser: AnalyserNode;
    spectrum: Uint8Array<ArrayBuffer>;
    /** When each track started (scheduled ahead), to know which is playing now. */
    starts: { at: number; track: number; trackStart: number }[];
}

/** What the music is doing right now, for things that move with it. */
export interface MusicPulse {
    /** The track playing (its id in music.json), or undefined in silence. */
    track?: string;
    /** Beats since the track started (fractional). */
    beat: number;
    /** 1 right on each beat, falling away until the next. */
    kick: number;
    /** How much low end there is right now, 0 to 1. */
    bass: number;
    /** How loud the music is right now, 0 to 1. */
    level: number;
}

export const SILENCE: MusicPulse = { beat: 0, kick: 0, bass: 0, level: 0 };

/**
 * Plays the battle music during matches. It's silent in the lobby, when
 * the player turns music off (N), or mutes all sound (M).
 */
export class Music {
    private manifest?: Promise<Manifest | undefined>;
    private buffers = new Map<string, Promise<AudioBuffer | undefined>>();
    private playback?: Playback;
    private starting = false;
    /** The game is in a match, where music belongs. */
    private inMatch = false;
    private enabled = readEnabled();
    /** Where to carry on after the music was paused (N or M). */
    private resumeAt?: Position;
    /** The last track played, so the next pick is a different one. */
    private lastTrack = -1;
    /** The music list once loaded, for reading the tempo every frame. */
    private loaded?: Manifest;
    /** Slowly-followed peaks, so loudness reads as 0..1 in every track. */
    private bassPeak = 0.3;
    private levelPeak = 0.3;
    private bassLevel = 0;

    constructor(private readonly sounds: SoundEffects) {}

    isEnabled() {
        return this.enabled;
    }

    /** N: music on or off. Returns whether it's now on. */
    toggle() {
        this.enabled = !this.enabled;

        try {
            localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
        } catch {
            // Private browsing can refuse storage: it just won't be remembered
        }

        this.refresh();
        return this.enabled;
    }

    /** Call when the game state changes: music during matches only. */
    setInMatch(inMatch: boolean) {
        // A new match starts a new track from the top
        if (inMatch && !this.inMatch) {
            this.resumeAt = undefined;
        }

        this.inMatch = inMatch;
        this.refresh();
    }

    /** Start or stop to match the settings (call after muting, too). */
    refresh() {
        if (this.shouldPlay()) {
            void this.start();
        } else {
            this.stop();
        }
    }

    destroy() {
        this.inMatch = false;
        this.stop(0);
        this.buffers.clear();
    }

    private shouldPlay() {
        return this.inMatch && this.enabled && !this.sounds.isMuted();
    }

    /** A random track, never the one just played (unless there's only one). */
    private pickTrack(manifest: Manifest, notThis: number): number {
        const count = manifest.tracks.length;
        if (count <= 1) {
            return 0;
        }

        const choices = [...Array(count).keys()].filter((i) => i !== notThis);
        return choices[Math.floor(Math.random() * choices.length)];
    }

    private async start() {
        if (this.playback || this.starting) {
            return;
        }

        const context = this.sounds.getContext();
        if (!context) {
            return;
        }

        this.starting = true;
        const manifest = await this.loadManifest();
        const at: Position | undefined = manifest && manifest.tracks.length > 0
            ? this.resumeAt ?? { track: this.pickTrack(manifest, this.lastTrack), part: 0 }
            : undefined;
        const buffer = manifest && at ? await this.loadPart(context, manifest, at) : undefined;
        this.starting = false;

        // Settings may have changed while it loaded
        if (!manifest || !at || !buffer || this.playback || !this.shouldPlay()) {
            return;
        }

        const output = context.createGain();
        const now = context.currentTime;
        output.gain.setValueAtTime(0.0001, now);
        output.gain.exponentialRampToValueAtTime(VOLUME, now + FADE_IN);
        // The analyser sits between the music and the speakers
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        output.connect(analyser);
        analyser.connect(context.destination);

        this.loaded = manifest;
        this.playback = {
            context,
            output,
            sources: [],
            current: at,
            next: at,
            nextEntry: "start",
            nextStart: now,
            analyser,
            spectrum: new Uint8Array(analyser.frequencyBinCount),
            starts: [],
        };
        this.playPart(manifest, at, buffer, now + 0.05, "start");
    }

    /** Schedule one part to start at `when`, and line up whatever follows it. */
    private playPart(
        manifest: Manifest,
        at: Position,
        buffer: AudioBuffer,
        when: number,
        entry: Entry,
    ) {
        const playback = this.playback;
        if (!playback) {
            return;
        }

        const { context } = playback;
        const track = manifest.tracks[at.track];
        const length = track.parts[at.part].samples / track.sampleRate;
        const pad = track.pad / track.sampleRate;
        const lastPart = at.part === track.parts.length - 1;

        const fade = context.createGain();
        fade.connect(playback.output);

        // How it comes in
        let startAt = when;
        let offset = pad;
        if (entry === "join") {
            startAt = when - PART_JOIN;
            offset = pad - PART_JOIN;
            fade.gain.setValueAtTime(0, startAt);
            fade.gain.linearRampToValueAtTime(1, when);
        } else if (entry === "crossfade") {
            // (A curve can't share its start time with another change)
            fade.gain.setValueCurveAtTime(equalPowerCurve(true), when, TRACK_CROSSFADE);
        } else {
            fade.gain.setValueAtTime(1, when);
        }

        // How it goes out: into the next part, or fading under the next track
        const end = when + length;
        let next: Position;
        let nextEntry: Entry;
        let nextStart: number;
        let stopAt: number;

        if (lastPart) {
            const fadeStart = end - TRACK_CROSSFADE;
            fade.gain.setValueCurveAtTime(equalPowerCurve(false), fadeStart, TRACK_CROSSFADE);
            next = { track: this.pickTrack(manifest, at.track), part: 0 };
            nextEntry = "crossfade";
            nextStart = fadeStart;
            stopAt = end + 0.05;
        } else {
            fade.gain.setValueAtTime(1, end);
            fade.gain.linearRampToValueAtTime(0, end + PART_JOIN);
            next = { track: at.track, part: at.part + 1 };
            nextEntry = "join";
            nextStart = end;
            stopAt = end + PART_JOIN + 0.01;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(fade);
        source.start(startAt, offset);
        source.stop(stopAt);
        source.onended = () => {
            source.disconnect();
            fade.disconnect();
            playback.sources = playback.sources.filter((s) => s !== source);
        };

        // Remember when this track starts (its first part, or where we resumed)
        if (entry !== "join") {
            const before = track.parts
                .slice(0, at.part)
                .reduce((sum, part) => sum + part.samples, 0);
            playback.starts.push({
                at: when,
                track: at.track,
                trackStart: when - before / track.sampleRate,
            });
        }

        playback.sources.push(source);
        playback.current = at;
        playback.next = next;
        playback.nextEntry = nextEntry;
        playback.nextStart = nextStart;
        this.lastTrack = at.track;

        // Keep just this part and the next decoded
        const keep = new Set([key(at), key(next)]);
        for (const k of this.buffers.keys()) {
            if (!keep.has(k)) {
                this.buffers.delete(k);
            }
        }
        void this.loadPart(context, manifest, next);

        const wait = Math.max(0, nextStart - context.currentTime - LOOKAHEAD);
        playback.timer = setTimeout(() => {
            void this.queueNext(manifest, playback);
        }, wait * 1000);
    }

    private async queueNext(manifest: Manifest, playback: Playback) {
        const { next, nextEntry, nextStart } = playback;
        const buffer = await this.loadPart(playback.context, manifest, next);

        // Stopped meanwhile, or the next part couldn't be loaded
        if (this.playback !== playback || !buffer) {
            return;
        }

        // If it arrived late (a slow connection), start it as soon as we can
        const earliest = playback.context.currentTime + 0.05;
        const late = nextStart < earliest;
        this.playPart(
            manifest,
            next,
            buffer,
            Math.max(nextStart, earliest),
            late && nextEntry === "join" ? "start" : nextEntry,
        );
    }

    /**
     * Where the music is now: the track, the beat, and how hard it's
     * hitting. Call it once per frame.
     */
    getPulse(): MusicPulse {
        const playback = this.playback;
        const manifest = this.loaded;
        if (!playback || !manifest) {
            this.bassLevel = 0;
            return SILENCE;
        }

        const { context, analyser, spectrum, starts } = playback;
        // What's coming out of the speakers now, not what's being scheduled
        const now = context.currentTime - (context.outputLatency || context.baseLatency || 0);

        // The latest track start that has happened
        while (starts.length > 1 && starts[1].at <= now) {
            starts.shift();
        }
        const playing = starts[0];
        if (!playing || playing.at > now) {
            return SILENCE;
        }

        const track = manifest.tracks[playing.track];
        const beat = Math.max(0, ((now - playing.trackStart) * (track.bpm ?? 120)) / 60);
        const kick = Math.exp(-(beat % 1) * 5);

        // Low end and overall loudness, each against its own slowly-falling peak
        analyser.getByteFrequencyData(spectrum);
        const binHz = context.sampleRate / analyser.fftSize;
        const bassBins = Math.max(1, Math.round(150 / binHz));
        const allBins = Math.round(8000 / binHz);
        let bass = 0;
        let level = 0;
        for (let i = 0; i < allBins; i++) {
            const value = spectrum[i] / 255;
            level += value;
            if (i < bassBins) {
                bass += value;
            }
        }
        bass /= bassBins;
        level /= allBins;

        this.bassPeak = Math.max(bass, this.bassPeak * 0.999, 0.2);
        this.levelPeak = Math.max(level, this.levelPeak * 0.999, 0.15);
        // Rise fast, fall a little slower: hits read as hits
        const target = Math.min(1, bass / this.bassPeak) ** 2;
        this.bassLevel += (target - this.bassLevel) * (target > this.bassLevel ? 0.6 : 0.15);

        return {
            track: track.id,
            beat,
            kick,
            bass: this.bassLevel,
            level: Math.min(1, level / this.levelPeak),
        };
    }

    private stop(fade = FADE_OUT) {
        const playback = this.playback;
        this.playback = undefined;

        if (!playback) {
            return;
        }

        this.resumeAt = playback.current;
        clearTimeout(playback.timer);

        const { context, output } = playback;
        const now = context.currentTime;

        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(output.gain.value, 0.0001), now);
        output.gain.exponentialRampToValueAtTime(0.0001, now + fade + 0.01);

        for (const source of playback.sources) {
            try {
                source.stop(now + fade + 0.05);
            } catch {
                // Already stopped
            }
        }

        setTimeout(() => output.disconnect(), (fade + 0.2) * 1000);
    }

    private loadManifest(): Promise<Manifest | undefined> {
        this.manifest ??= fetch(MANIFEST_URL)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`${response.status}`);
                }
                return response.json() as Promise<Manifest>;
            })
            .catch((error) => {
                // No music is better than a broken game: try again next time
                console.warn("Couldn't load the music:", error);
                this.manifest = undefined;
                return undefined;
            });

        return this.manifest;
    }

    /** Fetched and decoded when first needed. */
    private loadPart(
        context: AudioContext,
        manifest: Manifest,
        at: Position,
    ): Promise<AudioBuffer | undefined> {
        let loading = this.buffers.get(key(at));

        if (!loading) {
            const file = manifest.tracks[at.track].parts[at.part].file;
            loading = fetch(MUSIC_FOLDER + file)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`${response.status}`);
                    }
                    return response.arrayBuffer();
                })
                .then((data) => context.decodeAudioData(data))
                .catch((error) => {
                    console.warn(`Couldn't load ${file}:`, error);
                    this.buffers.delete(key(at));
                    return undefined;
                });

            this.buffers.set(key(at), loading);
        }

        return loading;
    }
}

function key(at: Position) {
    return `${at.track}:${at.part}`;
}

/** Equal-power fade: keeps the loudness steady while two tracks overlap. */
function equalPowerCurve(fadeIn: boolean): Float32Array {
    const steps = 64;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
        const x = i / (steps - 1);
        curve[i] = fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
    }
    return curve;
}

function readEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
        return true;
    }
}
