import { SoundEffects } from "./SoundEffects";

/**
 * "Hole in Fun", the battle music (made by tools/battle-music.py).
 *
 * It's three minutes long, so it comes in parts that are played one after
 * another and loop back to the first: decoding the whole song at once
 * would take around 70 MB. Only the part playing and the next one are
 * kept in memory, and the next is fetched while the current one plays.
 *
 * Each part's file has half a second of its neighbours before and after
 * it. A part starts from its padding and plays exactly its own length, so
 * parts join without a gap, and a short crossfade into the next part's
 * identical padding hides any rounding at the join.
 */
const MUSIC_FOLDER = "assets/audio/";
const MANIFEST_URL = MUSIC_FOLDER + "music.json";

/** Under the sound effects, which play at 0.6. */
const VOLUME = 0.32;
const FADE_IN = 1.5;
const FADE_OUT = 0.6;
/** Overlap between parts, in seconds (well inside the padding). */
const CROSSFADE = 0.02;
/** Schedule the next part this long before it's due. */
const LOOKAHEAD = 5;

/** Whether the player wants music, remembered between visits. */
const STORAGE_KEY = "golf.music";

interface Manifest {
    sampleRate: number;
    /** Samples of padding at each end of every part's file. */
    pad: number;
    parts: { file: string; samples: number }[];
}

/** What's playing right now. */
interface Playback {
    context: AudioContext;
    /** The music's own volume, for fading in and out. */
    output: GainNode;
    sources: AudioBufferSourceNode[];
    /** The part that's playing, and when the next one starts. */
    part: number;
    nextStart: number;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Plays the battle music on a loop during matches. It's silent in the
 * lobby, when the player turns music off (N), or mutes all sound (M).
 */
export class Music {
    private manifest?: Promise<Manifest | undefined>;
    private buffers = new Map<number, Promise<AudioBuffer | undefined>>();
    private playback?: Playback;
    private starting = false;
    /** The game is in a match, where music belongs. */
    private inMatch = false;
    private enabled = readEnabled();
    /** Where to carry on after the music was paused (N or M). */
    private resumePart = 0;

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
        // A new match starts from the top of the song
        if (inMatch && !this.inMatch) {
            this.resumePart = 0;
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
        const part = manifest ? this.resumePart % manifest.parts.length : 0;
        const buffer = manifest ? await this.loadPart(context, manifest, part) : undefined;
        this.starting = false;

        // Settings may have changed while it loaded
        if (!manifest || !buffer || this.playback || !this.shouldPlay()) {
            return;
        }

        const output = context.createGain();
        const now = context.currentTime;
        output.gain.setValueAtTime(0.0001, now);
        output.gain.exponentialRampToValueAtTime(VOLUME, now + FADE_IN);
        output.connect(context.destination);

        this.playback = { context, output, sources: [], part, nextStart: now };
        this.playPart(manifest, part, buffer, now + 0.05, true);
    }

    /** Schedule one part to start at `when`, and the next one after it. */
    private playPart(
        manifest: Manifest,
        part: number,
        buffer: AudioBuffer,
        when: number,
        first: boolean,
    ) {
        const playback = this.playback;
        if (!playback) {
            return;
        }

        const { context } = playback;
        const length = manifest.parts[part].samples / manifest.sampleRate;
        const pad = manifest.pad / manifest.sampleRate;
        // The first part just starts; later ones fade in over the last one's tail
        const lead = first ? 0 : CROSSFADE;

        const fade = context.createGain();
        fade.connect(playback.output);
        fade.gain.setValueAtTime(first ? 1 : 0, when - lead);
        fade.gain.linearRampToValueAtTime(1, when);
        fade.gain.setValueAtTime(1, when + length);
        fade.gain.linearRampToValueAtTime(0, when + length + CROSSFADE);

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(fade);
        source.start(when - lead, pad - lead);
        source.stop(when + length + CROSSFADE + 0.01);
        source.onended = () => {
            source.disconnect();
            fade.disconnect();
            playback.sources = playback.sources.filter((s) => s !== source);
        };

        playback.sources.push(source);
        playback.part = part;
        playback.nextStart = when + length;

        // Keep just this part and the next in memory
        const next = (part + 1) % manifest.parts.length;
        for (const index of this.buffers.keys()) {
            if (index !== part && index !== next) {
                this.buffers.delete(index);
            }
        }
        void this.loadPart(context, manifest, next);

        const wait = Math.max(0, playback.nextStart - context.currentTime - LOOKAHEAD);
        playback.timer = setTimeout(() => {
            void this.queueNext(manifest, playback, next);
        }, wait * 1000);
    }

    private async queueNext(manifest: Manifest, playback: Playback, part: number) {
        const buffer = await this.loadPart(playback.context, manifest, part);

        // Stopped meanwhile, or the next part couldn't be loaded
        if (this.playback !== playback || !buffer) {
            return;
        }

        // If it arrived late (a slow connection), start it as soon as we can
        const earliest = playback.context.currentTime + 0.05;
        const late = playback.nextStart < earliest;
        this.playPart(manifest, part, buffer, Math.max(playback.nextStart, earliest), late);
    }

    private stop(fade = FADE_OUT) {
        const playback = this.playback;
        this.playback = undefined;

        if (!playback) {
            return;
        }

        this.resumePart = playback.part;
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
        part: number,
    ): Promise<AudioBuffer | undefined> {
        let loading = this.buffers.get(part);

        if (!loading) {
            loading = fetch(MUSIC_FOLDER + manifest.parts[part].file)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`${response.status}`);
                    }
                    return response.arrayBuffer();
                })
                .then((data) => context.decodeAudioData(data))
                .catch((error) => {
                    console.warn(`Couldn't load part ${part + 1} of the music:`, error);
                    this.buffers.delete(part);
                    return undefined;
                });

            this.buffers.set(part, loading);
        }

        return loading;
    }
}

function readEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
        return true;
    }
}
