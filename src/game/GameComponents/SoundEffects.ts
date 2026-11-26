/**
 * Small sound effects made with the Web Audio API, so the game needs no
 * audio files. Each effect is a few short tones or a burst of noise.
 */
export class SoundEffects {
    private context?: AudioContext;
    private master?: GainNode;
    private muted = false;
    private lastBounceAt = 0;

    isMuted() {
        return this.muted;
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    /** Club hitting the ball. */
    putt(strength = 1) {
        const volume = 0.25 + 0.35 * Math.min(strength, 1);

        this.noise(0.04, volume, 2500);
        this.tone(900, 0.08, volume * 0.6, "triangle", 0, 500);
    }

    /** Ball hitting a wall or another ball. `intensity` is 0..1. */
    bounce(intensity: number) {
        // Many bounces can happen in the same moment; keep it from buzzing
        const now = performance.now();
        if (now - this.lastBounceAt < 60) {
            return;
        }
        this.lastBounceAt = now;

        const volume = 0.08 + 0.3 * Math.min(Math.max(intensity, 0), 1);

        this.tone(220, 0.09, volume, "sine", 0, 120);
        this.noise(0.02, volume * 0.5, 800);
    }

    /** Ball rattling into the cup, then a little chime. */
    cup() {
        this.tone(1400, 0.04, 0.15, "square", 0);
        this.tone(1200, 0.04, 0.12, "square", 0.07);
        this.tone(1000, 0.05, 0.1, "square", 0.13);

        this.tone(660, 0.18, 0.25, "sine", 0.25);
        this.tone(990, 0.35, 0.25, "sine", 0.38);
    }

    /** Ball takes off from a ramp: a rising whoosh. */
    jump() {
        this.noise(0.12, 0.12, 1800);
        this.tone(300, 0.22, 0.12, "sine", 0, 700);
    }

    /** Ball drops into a tunnel and comes out the other end. */
    tunnel() {
        this.tone(180, 0.12, 0.18, "triangle", 0, 90);
        this.tone(240, 0.1, 0.12, "triangle", 0.16, 320);
    }

    /** Ball catches the rim and rolls on: a quick metallic rattle. */
    lipOut() {
        this.tone(1500, 0.03, 0.1, "square", 0);
        this.tone(1300, 0.03, 0.08, "square", 0.05);
    }

    /** Soft tick for each of the last seconds on the shot clock. */
    clockTick() {
        this.tone(1800, 0.03, 0.07, "square", 0);
    }

    /** Short tick when your shot is locked in. */
    lockIn() {
        this.tone(1200, 0.05, 0.15, "triangle", 0);
        this.tone(1600, 0.06, 0.12, "triangle", 0.06);
    }

    private getOutput(): { context: AudioContext; output: GainNode } | undefined {
        if (this.muted) {
            return undefined;
        }

        const context = this.getContext();
        return context ? { context, output: this.master! } : undefined;
    }

    /**
     * The game's one audio context, made
     * on first use. Undefined if the browser has no Web Audio.
     */
    getContext(): AudioContext | undefined {
        if (!this.context) {
            const AudioContextClass =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                    .webkitAudioContext;

            if (!AudioContextClass) {
                return undefined;
            }

            this.context = new AudioContextClass();
            this.master = this.context.createGain();
            this.master.gain.value = 0.6;
            this.master.connect(this.context.destination);
        }

        // Browsers start audio paused until the player has clicked something
        if (this.context.state === "suspended") {
            void this.context.resume();
        }

        return this.context;
    }

    private tone(
        frequency: number,
        duration: number,
        volume: number,
        type: OscillatorType,
        delay: number,
        endFrequency?: number,
    ) {
        const audio = this.getOutput();
        if (!audio) {
            return;
        }

        const { context, output } = audio;
        const start = context.currentTime + delay;

        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);

        if (endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(
                endFrequency,
                start + duration,
            );
        }

        const gain = context.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain).connect(output);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }

    private noise(duration: number, volume: number, filterFrequency: number) {
        const audio = this.getOutput();
        if (!audio) {
            return;
        }

        const { context, output } = audio;
        const start = context.currentTime;

        const length = Math.max(1, Math.floor(context.sampleRate * duration));
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const samples = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            samples[i] = Math.random() * 2 - 1;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;

        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = filterFrequency;

        const gain = context.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        source.connect(filter).connect(gain).connect(output);
        source.start(start);
    }
}
