"""
Shared pieces for the game's music: the beat grid, notes and chords,
filters, synth voices, drum sounds and writing a track out in parts.

Every track script calls setup() first with its tempo and length; the grid
functions (at, track, ...) then work in that track's time.
"""

import json
import os

import numpy as np
from scipy import signal

SR = 44100
TAIL = 4 * SR  # room for ringing notes and reverb, folded onto the start
PAD = SR // 2  # padding around each part for the game

BPM = 120
S16 = 60 / BPM / 4
BARS = 64
PARTS = 4
BARS_PER_PART = 16
LOOP = 0

rng = np.random.default_rng(1)


def setup(bpm, bars, parts, seed):
    """Set the tempo and length for the track being made."""
    global BPM, S16, BARS, PARTS, BARS_PER_PART, LOOP, rng
    assert bars % parts == 0
    BPM, BARS, PARTS = bpm, bars, parts
    S16 = 60 / bpm / 4
    BARS_PER_PART = bars // parts
    LOOP = int(round(bars * 16 * S16 * SR))
    rng = np.random.default_rng(seed)


# --- Grid ----------------------------------------------------------------------


def at(pos16):
    """Sample index of a position on the 16th-note grid."""
    return int(round(pos16 * S16 * SR))


def track():
    return np.zeros(LOOP + TAIL)


def add(dest, start, sound):
    start = max(0, start)
    end = min(len(dest), start + len(sound))
    if end > start:
        dest[start:end] += sound[: end - start]


# --- Notes and filters ---------------------------------------------------------

NOTE_INDEX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    """'F#5', 'Bb4' -> MIDI number."""
    pitch = NOTE_INDEX[name[0]]
    rest = name[1:]
    if rest.startswith("#"):
        pitch += 1
        rest = rest[1:]
    elif rest.startswith("b"):
        pitch -= 1
        rest = rest[1:]
    return pitch + 12 * (int(rest) + 1)


def pc(name):
    return note(name + "0") % 12


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x, kind, freq, order=2):
    return signal.sosfilt(signal.butter(order, freq, btype=kind, fs=SR, output="sos"), x)


def peak(x, freq, q, gain):
    b, a = signal.iirpeak(freq, q, fs=SR)
    return x + gain * signal.lfilter(b, a, x)


def saw(phase, freq, limit=15000, harmonics=14):
    """Band-limited sawtooth from a phase array (freq per sample)."""
    out = np.zeros_like(phase)
    freq = np.broadcast_to(freq, phase.shape)
    for k in range(1, harmonics + 1):
        mask = (freq * k) < limit
        if not np.any(mask):
            break
        out += np.sin(k * phase) / k * mask
    return out


def square(phase, freq, limit=14000, harmonics=13):
    out = np.zeros_like(phase)
    freq = np.broadcast_to(freq, phase.shape)
    for k in range(1, harmonics + 1, 2):
        mask = (freq * k) < limit
        if not np.any(mask):
            break
        out += np.sin(k * phase) / k * mask
    return out


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def delay(x, time16, feedback, mix):
    """Echoes every `time16` sixteenths, each `feedback` times quieter."""
    d = at(time16)
    out = x.copy()
    echo = x.copy()
    for _ in range(6):
        echo = np.concatenate([np.zeros(d), echo[:-d]]) * feedback
        out += echo * mix / feedback
    return out


def reverb_ir(seconds, seed, predelay=0.015):
    r = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    ir = r.standard_normal(len(t)) * np.exp(-t * 7 / seconds)
    ir = filt(ir, "lowpass", 7000)
    ir[: int(predelay * SR)] = 0
    return ir / np.sqrt(np.sum(ir**2))


def stereo_reverb(x, seconds):
    n = len(x)
    return (
        signal.oaconvolve(x, reverb_ir(seconds, 1))[:n],
        signal.oaconvolve(x, reverb_ir(seconds, 2))[:n],
    )


# --- Harmony and writing -------------------------------------------------------


class Song:
    """
    The chords of a track bar by bar, with helpers for writing lines over
    them. chords: name -> (root, [tone names]); scale(chord) -> pitch classes.
    """

    def __init__(self, chords, scale, licks):
        self.chords = chords
        self.scale = scale
        self.licks = licks  # pitch classes improvised lines favour
        self.bar_chord = []
        self.bar_section = []
        self.bar_inner = []
        self.section_start = {}

    def add_section(self, name, chords):
        self.section_start[name] = len(self.bar_chord)
        for i, chord in enumerate(chords):
            self.bar_chord.append(chord)
            self.bar_section.append(name)
            self.bar_inner.append(i)

    def done(self):
        assert len(self.bar_chord) == BARS, (len(self.bar_chord), BARS)

    def chord_at(self, pos16):
        return self.bar_chord[int(pos16 // 16) % BARS]

    def chord_pcs(self, chord):
        return [pc(n) for n in self.chords[chord][1]]

    def root(self, chord, octave):
        return note(self.chords[chord][0] + str(octave))

    def scale_step(self, m, steps, chord):
        notes = sorted(o * 12 + p for o in range(1, 10) for p in self.scale(chord))
        if m not in notes:
            notes = sorted(notes + [m])
        return notes[notes.index(m) + steps]

    def chord_notes(self, chord, low, high):
        pcs = self.chord_pcs(chord)
        return [m for m in range(low, high + 1) if m % 12 in pcs]

    def nearest_chord_tone(self, m, chord):
        return min(self.chord_notes(chord, m - 7, m + 7), key=lambda t: (abs(t - m), t))

    def voicing(self, chord, floor, count=4, skip_root=True):
        names = self.chords[chord][1][1:] if skip_root else self.chords[chord][1]
        pcs = [pc(n) for n in names]
        count = min(count, len(pcs))
        out = []
        m = floor
        while len(out) < count:
            if m % 12 in pcs and m % 12 not in [o % 12 for o in out]:
                out.append(m)
            m += 1
        return out

    def harmonise(self, line, steps=2):
        """A diatonic third (or other interval) from each note, following the chords."""
        return [(s, l, self.scale_step(m, steps, self.chord_at(s)), f) for s, l, m, f in line]

    # --- improvising

    RHYTHMS = {
        "slow": [[4, 4, 8], [2, 2, 4, 8], [6, 2, 8], [3, 3, 2, 8], [8, 8]],
        "medium": [[2, 2, 2, 2, 4, 4], [1, 1, 2, 2, 2, 4, 4], [3, 1, 2, 2, 4, 4], [3, 3, 2, 2, 2, 4], [1, 1, 1, 1, 2, 2, 8]],
        "fast": [[1] * 8 + [4, 4], [1] * 12 + [4], [1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 4], [2 / 3] * 12 + [8]],
        "shred": [[2 / 3] * 24, [2 / 3] * 18 + [4], [1] * 16],
    }

    def lick(self, pos, rhythm, start_note, contour, low, high, r):
        """One phrase from `pos`; follows `contour` (scale steps) if given."""
        out, steps = [], []
        m = start_note
        for i, length in enumerate(rhythm):
            chord = self.chord_at(pos)
            pool = [
                p for p in range(low, high + 1)
                if (p % 12 in self.licks and p % 12 in self.scale(chord)) or p % 12 in self.chord_pcs(chord)
            ]
            if contour is not None and i < len(contour):
                move = contour[i]
            else:
                move = int(r.choice([-2, -1, -1, 1, 1, 2, 3, -3], p=[0.1, 0.22, 0.13, 0.22, 0.13, 0.1, 0.05, 0.05]))
            steps.append(move)
            here = min(range(len(pool)), key=lambda j: abs(pool[j] - m))
            index = here + move
            if index < 0 or index >= len(pool):
                index = here - move
            m = pool[max(0, min(len(pool) - 1, index))]
            if i == len(rhythm) - 1 or length >= 4:
                m = min(pool, key=lambda p: (abs(p - self.nearest_chord_tone(m, chord)), p))
            flags = "v" + ("b" if r.random() < 0.3 else "") if length >= 4 else ""
            out.append((pos, length, m, flags))
            pos += length
        return out, steps

    def improvise(self, first_bar, bars, density, low, high, seed):
        """Licks in two-bar phrases; every other phrase repeats the last motif."""
        r = np.random.default_rng(seed)
        low, high = note(low), note(high)
        notes = []
        current = (low + high) // 2
        motif = None
        for phrase in range(0, bars, 2):
            pos = (first_bar + phrase) * 16
            if phrase % 4 == 2 and motif:
                line, _ = self.lick(pos, motif[0], current, motif[1], low, high, r)
            else:
                rhythm = list(self.RHYTHMS[density[0]][r.integers(len(self.RHYTHMS[density[0]]))])
                line, contour = self.lick(pos, rhythm, current, None, low, high, r)
                motif = (rhythm, contour)
            notes += line
            current = line[-1][2]
            if phrase + 1 < bars:
                rhythm = list(self.RHYTHMS[density[1]][r.integers(len(self.RHYTHMS[density[1]]))])
                answer, _ = self.lick(pos + 16, rhythm, current, None, low, high, r)
                notes += answer
                current = answer[-1][2]
        return notes

    def sweeps(self, bar, low="E4", high="C6"):
        """Sextuplet sweep arpeggios: up a beat, down a beat."""
        tones = self.chord_notes(self.bar_chord[bar], note(low), note(high))[:6]
        notes = []
        pos = bar * 16.0
        for beat in range(4):
            for m in tones if beat % 2 == 0 else tones[::-1]:
                notes.append((pos, 2 / 3, m, ""))
                pos += 2 / 3
        return notes


def parse_bar(text, bar):
    """NOTE:LENGTH (16ths) + flags; v vibrato, b/h bend up, s slide in. r = rest."""
    notes = []
    pos = bar * 16.0
    for token in text.split():
        name, rest = token.split(":")
        length = float("".join(ch for ch in rest if ch.isdigit() or ch == "."))
        flags = "".join(ch for ch in rest if not (ch.isdigit() or ch == "."))
        if name != "r":
            notes.append((pos, length, note(name), flags))
        pos += length
    assert abs(pos - (bar + 1) * 16) < 1e-6, f"bar {bar + 1}: {text} adds up to {pos - bar * 16}"
    return notes


def written(lines, first_bar):
    out = []
    for i, text in enumerate(lines):
        out += parse_bar(text, first_bar + i)
    return out


def octave(line, shift=12):
    return [(s, l, m + shift, f) for s, l, m, f in line]


def check(notes, name):
    """Sorted, and one note at a time."""
    notes = sorted(notes)
    for (s1, l1, *_), (s2, *_) in zip(notes, notes[1:]):
        assert s1 + l1 <= s2 + 1e-6, f"{name}: overlap at bar {s1 // 16 + 1}"
    return notes


# --- Lead voices -------------------------------------------------------------------


def line_curves(notes, glide_ms, vibrato_depth, vibrato_rate, attack):
    """Per-sample frequency and envelope for a monophonic line, and its note starts."""
    n = LOOP + TAIL
    logf = np.full(n, np.log2(440.0))
    amp = np.zeros(n)
    onsets = []
    for i, (s16, len16, m, flags) in enumerate(notes):
        s0, s1 = at(s16), at(s16 + len16)
        length = s1 - s0
        if length <= 0:
            continue
        nxt = notes[i + 1][0] if i + 1 < len(notes) else None
        legato = nxt is not None and abs(nxt - (s16 + len16)) < 1e-6
        t = np.arange(length) / SR
        target = np.log2(midi_hz(m))
        curve = np.full(length, target)
        if "b" in flags or "h" in flags:
            depth = 2 if "b" in flags else 1
            k = np.clip(np.arange(length) / min(length * 0.35, 0.14 * SR), 0, 1)
            curve = target - depth / 12 * (1 - (0.5 - 0.5 * np.cos(np.pi * k)))
        if "s" in flags:
            k = np.clip(np.arange(length) / min(length * 0.4, 0.08 * SR), 0, 1)
            curve = target - 2 / 12 * (1 - k) ** 2
        if "v" in flags:
            fade = np.clip((t - 0.3 * length / SR) / 0.15, 0, 1)
            curve = curve + fade * vibrato_depth / 12 * np.sin(2 * np.pi * vibrato_rate * t)
        logf[s0:s1] = curve
        if not legato:
            logf[s1 : (at(nxt) if nxt is not None else n)] = curve[-1]
        env = 0.6 + 0.4 * (1 - np.exp(-t / attack))
        if not legato:
            rel = min(int(0.04 * SR), length // 3)
            env[-rel:] *= np.linspace(1, 0, rel)
        amp[s0:s1] = np.maximum(amp[s0:s1], env)
        onsets.append(s0)
    a = np.exp(-1 / (glide_ms / 1000 * SR))
    logf = signal.lfilter([1 - a], [1, -a], logf, zi=[logf[0] * a])[0]
    return 2**logf, amp, onsets


def render_lead_guitar(notes, bright=False, drive=None):
    """A singing electric lead: warm neck pickup, or bright bridge pickup."""
    freq, amp, onsets = line_curves(notes, 4, 0.4, 6.6 if bright else 5.8, 0.01)
    phase = np.cumsum(2 * np.pi * freq / SR)
    raw = saw(phase, freq) + 0.3 * saw(phase * 1.002, freq)
    picks = np.zeros(len(amp))
    for s0 in onsets:
        add(picks, s0, rng.standard_normal(int(0.005 * SR)) * np.linspace(1, 0, int(0.005 * SR)))
    x = raw * amp + 0.2 * filt(picks, "bandpass", [2000, 6000])
    x = filt(x, "highpass", 400 if bright else 250)
    x = np.tanh((drive or (9 if bright else 6)) * x)
    x = filt(x, "lowpass", 7500 if bright else 4800, 4)
    x = peak(x, 2800 if bright else 1200, 1.0, 0.7 if bright else 0.5)
    gate = signal.lfilter([0.002], [1, -0.998], (amp > 0).astype(float))
    return filt(x, "highpass", 150) * np.clip(gate * 1.2, 0, 1)


def render_synth_lead(notes, glide_ms=12, cutoff=3800):
    """Saw and square with a little glide, filtered."""
    freq, amp, _ = line_curves(notes, glide_ms, 0.25, 5.5, 0.006)
    phase = np.cumsum(2 * np.pi * freq / SR)
    x = 0.6 * saw(phase, freq) + 0.5 * square(phase, freq) + 0.4 * saw(phase * 1.006, freq)
    x = filt(x * amp, "lowpass", cutoff, 2)
    x = peak(x, 1200, 1.5, 0.4)
    return np.tanh(1.5 * x)


def render_supersaw(notes, voices=5, spread=0.012, cutoff=6000, glide_ms=8):
    """A stack of detuned saws: the big trance / Eurobeat lead. Stereo."""
    freq, amp, _ = line_curves(notes, glide_ms, 0.2, 5.5, 0.004)
    left = np.zeros(len(amp))
    right = np.zeros(len(amp))
    base = np.cumsum(2 * np.pi * freq / SR)
    for i in range(voices):
        d = spread * (i / (voices - 1) - 0.5) * 2
        voice = saw(base * (1 + d) + rng.uniform(0, 6), freq * (1 + d), harmonics=10)
        pan = i / (voices - 1)
        left += voice * (1 - pan * 0.9)
        right += voice * (0.1 + pan * 0.9)
    left = filt(left * amp, "lowpass", cutoff)
    right = filt(right * amp, "lowpass", cutoff)
    return np.tanh(0.8 * left), np.tanh(0.8 * right)


# --- Drums -------------------------------------------------------------------------


def kick(punch=1.0, length=0.4):
    t = np.arange(int(length * SR)) / SR
    f = 48 + 140 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = filt(rng.standard_normal(len(t)), "highpass", 2000) * np.exp(-t * 300) * 0.4 * punch
    return np.tanh(1.6 * (body + click))


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = filt(rng.standard_normal(n), "bandpass", [900, 4500])
    env = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) / 0.007), 0) * (t >= d)
    env += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.09), 0) * 0.6
    return noise * env + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.4


def snare(tone_hz=200):
    t = np.arange(int(0.3 * SR)) / SR
    noise = filt(rng.standard_normal(len(t)), "bandpass", [1200, 9000]) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * tone_hz * t) * np.exp(-t * 28)
    return np.tanh(1.5 * (0.9 * noise + 0.8 * tone))


def gated_snare():
    """The 80s snare: a big room that's cut off dead after a moment."""
    dry = snare(185)
    room = signal.oaconvolve(dry, reverb_ir(0.8, 7, predelay=0.005))[: int(0.5 * SR)]
    room = room / np.max(np.abs(room))
    t = np.arange(len(room)) / SR
    gate = np.clip((0.26 - t) / 0.03, 0, 1)
    out = room * 0.9 * gate
    out[: len(dry)] += dry
    return out


def metallic(length_s, decay):
    """808-style hat: square waves at clashing pitches, high-passed."""
    t = np.arange(int(length_s * SR)) / SR
    tone = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (263, 400, 421, 474, 587, 845))
    return filt(tone, "highpass", 7000) * np.exp(-t / decay)


def crash(length=2.2):
    t = np.arange(int(length * SR)) / SR
    return filt(rng.standard_normal(len(t)), "highpass", 5000) * np.exp(-t * 1.8)


def ride():
    t = np.arange(int(0.6 * SR)) / SR
    wash = filt(rng.standard_normal(len(t)), "highpass", 6000) * np.exp(-t * 9) * 0.6
    bell = (np.sin(2 * np.pi * 2650 * t) + 0.6 * np.sin(2 * np.pi * 3970 * t)) * np.exp(-t * 6) * 0.25
    return wash + bell


def tom(f0, sweep=0.3):
    """Electronic tom: a sine that drops in pitch."""
    t = np.arange(int(0.45 * SR)) / SR
    f = f0 * ((1 - sweep) + sweep * np.exp(-t * 10))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    return body + filt(rng.standard_normal(len(t)), "highpass", 3000) * np.exp(-t * 80) * 0.2


def pump(kick_times, depth=0.35, release=0.16):
    """A gain curve that ducks on every kick: the sidechain pump."""
    n = LOOP + TAIL
    g = np.ones(n)
    shape = 1 - depth * np.exp(-np.arange(int(0.5 * SR)) / (release * SR))
    for t0 in kick_times:
        end = min(n, t0 + len(shape))
        g[t0:end] = np.minimum(g[t0:end], shape[: end - t0])
    return g


def swept(x, w, cutoff=450):
    """Crossfade x with a dark copy by w (0..1): a filter sweep."""
    dark = filt(x, "lowpass", cutoff)
    return w * x + (1 - w) * dark


def riser(bars, start_bar):
    """White noise sweeping up over `bars` bars, for builds."""
    n = at(bars * 16)
    t = np.arange(n) / n
    noise = rng.standard_normal(n)
    lo = filt(noise, "highpass", 300)
    hi = filt(noise, "highpass", 5000)
    return (lo * (1 - t) + hi * t) * t**2, at(start_bar * 16)


# --- Finishing --------------------------------------------------------------------


def master(left, right, sheen=0.4):
    """Fold the tail onto the start, then level, glue and leave headroom."""
    out = []
    for ch in (left, right):
        looped = ch[:LOOP].copy()
        looped[:TAIL] += ch[LOOP:]
        out.append(looped)
    m = np.stack(out, axis=1)
    for i in range(2):
        m[:, i] += sheen * filt(m[:, i], "highpass", 6000)
    m = m / np.percentile(np.abs(m), 99.7)
    m = np.tanh(1.05 * m)
    return m / np.max(np.abs(m)) * 0.93


def write_parts(folder, name, title, mix):
    """Write the full track, its parts (with padding) and its manifest entry."""
    from scipy.io import wavfile

    os.makedirs(folder, exist_ok=True)
    audio = (mix * 32767).astype(np.int16)
    wavfile.write(os.path.join(folder, f"{name}-full.wav"), SR, audio)
    parts = []
    for i in range(PARTS):
        a, b = at(i * BARS_PER_PART * 16), at((i + 1) * BARS_PER_PART * 16)
        idx = np.arange(a - PAD, b + PAD) % LOOP
        wavfile.write(os.path.join(folder, f"{name}-{i + 1}.wav"), SR, audio[idx])
        parts.append({"file": f"{name}-{i + 1}.mp3", "samples": b - a})
    entry = {"id": name, "title": title, "bpm": BPM, "sampleRate": SR, "pad": PAD, "parts": parts}
    with open(os.path.join(folder, f"{name}.json"), "w") as f:
        json.dump(entry, f, indent=2)
    print(f"{title}: {LOOP / SR:.1f} s in {PARTS} parts")
    return entry
