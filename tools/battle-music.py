"""
"Hole in Fun": electric disco music for GOLF - golf.

A three-minute seamless loop: 96 bars at 128 BPM in A minor (Dorian on the
groove). A four-on-the-floor drum machine with claps, open hi-hats and
"pew" syn-tom fills, an octave-jumping synth bass, interlocking clean
rhythm guitars, electric piano, synth strings, a synth lead on the hook,
and two electric lead guitars dancing with each other: a warm one on the
left and a bright one on the right that answer, mirror, trade, weave
and harmonise all the way through. Everything but the drums pumps with
the kick, and the intro and breakdown open up with a filter sweep.

    Intro       8  drums and a filter opening up; the guitars call and answer
    Groove     16  the synth hook, then both guitars on it in harmony
    Chorus     16  strings soar, the guitars trade answers between the lines
    Solo       16  a guitar duel: 2 bars each, 1, a half, then together
    Breakdown   8  the kick drops out, filter down, the guitars weave up
    Chorus 2   16  twin guitars on the melody, swapping parts halfway
    Outro      16  weaving arpeggios, the hook in harmony, a last duel

Everything is synthesised here with numpy: no samples. Effects and ringing
notes that run past the end are folded back onto the start, so the loop has
no seam. The game streams it in 4 parts of 24 bars:

    python3 tools/battle-music.py out-folder

writes battle-1.wav ... battle-4.wav (each with half a second of its
neighbours as padding) and music.json. Encode them for the game with ffmpeg:

    for f in out-folder/battle-*.wav; do
        ffmpeg -i "$f" -codec:a libmp3lame -b:a 160k "public/assets/audio/$(basename "${f%.wav}").mp3"
    done
    cp out-folder/music.json public/assets/audio/

(needs Python with numpy and scipy).
"""

import json
import os
import sys

import numpy as np
from scipy import signal

SR = 44100
BPM = 128
S16 = 60 / BPM / 4  # one sixteenth note, in seconds
PARTS = 4
BARS_PER_PART = 24
BARS = PARTS * BARS_PER_PART
LOOP = int(round(BARS * 16 * S16 * SR))
TAIL = 4 * SR
PAD = SR // 2

rng = np.random.default_rng(128)


def at(pos16):
    return int(round(pos16 * S16 * SR))


def track():
    return np.zeros(LOOP + TAIL)


def add(dest, start, sound):
    start = max(0, start)
    end = min(len(dest), start + len(sound))
    if end > start:
        dest[start:end] += sound[: end - start]


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE_INDEX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    pitch = NOTE_INDEX[name[0]]
    rest = name[1:]
    if rest.startswith("#"):
        pitch += 1
        rest = rest[1:]
    elif rest.startswith("b"):
        pitch -= 1
        rest = rest[1:]
    return pitch + 12 * (int(rest) + 1)


def filt(x, kind, freq, order=2):
    return signal.sosfilt(signal.butter(order, freq, btype=kind, fs=SR, output="sos"), x)


def peak(x, freq, q, gain):
    b, a = signal.iirpeak(freq, q, fs=SR)
    return x + gain * signal.lfilter(b, a, x)


def saw(phase, freq, limit=15000, harmonics=14):
    out = np.zeros_like(phase)
    for k in range(1, harmonics + 1):
        mask = (freq * k) < limit
        if not np.any(mask):
            break
        out += np.sin(k * phase) / k * mask
    return out


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


# --- Harmony -----------------------------------------------------------------

CHORDS = {
    "Am9": ("A", ["A", "C", "E", "G", "B"]),
    "D9": ("D", ["D", "F#", "A", "C", "E"]),
    "Fmaj7": ("F", ["F", "A", "C", "E"]),
    "G6": ("G", ["G", "B", "D", "E"]),
    "Em7": ("E", ["E", "G", "B", "D"]),
    "Am7": ("A", ["A", "C", "E", "G"]),
    "Dm7": ("D", ["D", "F", "A", "C"]),
    "E7": ("E", ["E", "G#", "B", "D"]),
}


def pc(name):
    return note(name + "0") % 12


def chord_pcs(chord):
    return [pc(n) for n in CHORDS[chord][1]]


def scale_for(chord):
    """A Dorian on the vamp, A natural minor on the chorus, harmonic over E7."""
    if chord in ("Am9", "D9"):
        return [9, 11, 0, 2, 4, 6, 7]
    if chord == "E7":
        return [9, 11, 0, 2, 4, 5, 8]
    return [9, 11, 0, 2, 4, 5, 7]


def scale_step(m, steps, chord):
    notes = sorted(o * 12 + p for o in range(1, 10) for p in scale_for(chord))
    if m not in notes:
        notes = sorted(notes + [m])
    return notes[notes.index(m) + steps]


def chord_notes(chord, low, high):
    pcs = chord_pcs(chord)
    return [m for m in range(low, high + 1) if m % 12 in pcs]


def nearest_chord_tone(m, chord):
    return min(chord_notes(chord, m - 7, m + 7), key=lambda t: (abs(t - m), t))


def voicing(chord, floor, count=4, skip_root=True):
    """A close voicing of the chord from `floor` up."""
    names = CHORDS[chord][1][1:] if skip_root else CHORDS[chord][1]
    pcs = [pc(n) for n in names]
    # A chord can't give more different notes than it has
    count = min(count, len(pcs))
    out = []
    m = floor
    while len(out) < count:
        if m % 12 in pcs and m % 12 not in [o % 12 for o in out]:
            out.append(m)
        m += 1
    return out


def root_of(chord, octave):
    return note(CHORDS[chord][0] + str(octave))


# --- The song form -----------------------------------------------------------

VAMP = ["Am9", "Am9", "D9", "D9"]
CHORUS_PROG = ["Fmaj7", "G6", "Em7", "Am7"]
BREAK_PROG = ["Dm7", "Dm7", "Am7", "Am7", "Dm7", "Dm7", "E7", "E7"]

SECTIONS = [
    ("intro", [VAMP[i % 4] for i in range(8)]),
    ("groove", [VAMP[i % 4] for i in range(16)]),
    ("chorus", [CHORUS_PROG[i % 4] for i in range(16)]),
    ("solo", [VAMP[i % 4] for i in range(16)]),
    ("breakdown", BREAK_PROG),
    ("chorus2", [CHORUS_PROG[i % 4] for i in range(16)]),
    ("outro", [VAMP[i % 4] for i in range(16)]),
]

BAR_CHORD, BAR_SECTION, BAR_INNER = [], [], []
SECTION_START = {}
for _name, _chords in SECTIONS:
    SECTION_START[_name] = len(BAR_CHORD)
    for _i, _c in enumerate(_chords):
        BAR_CHORD.append(_c)
        BAR_SECTION.append(_name)
        BAR_INNER.append(_i)
assert len(BAR_CHORD) == BARS, len(BAR_CHORD)


def in_section(bar, *names):
    return BAR_SECTION[bar] in names


# --- Melodies ----------------------------------------------------------------

# NOTE:LENGTH (in 16ths), flags after the length: v vibrato, b bend up a
# whole step, h half step, s slide up into the note. r is a rest.
HOOK = [
    "E5:2 A5:2 r:1 G5:1 A5:2 C6:2 B5:2 A5:2 G5:2",
    "E5:3 D5:1 E5:2 r:2 A4:2 C5:2 D5:2 E5:2",
    "F#5:2 A5:2 r:1 G5:1 A5:2 D6:2 C6:2 A5:2 G5:2",
    "A5:6v F#5:2 E5:2 D5:2 E5:4",
]

CHORUS_MELODY = [
    "A5:6 C6:2 E6:8v",
    "D6:6 B5:2 G5:8v",
    "G5:4 B5:4 E6:4 D6:4",
    "C6:12v B5:2 A5:2",
    "A5:2 C6:2 F6:4 E6:4 C6:4",
    "D6:2 E6:2 G6:4 E6:4 D6:4",
    "E6:4 D6:2 B5:2 G5:4 B5:4",
    "A5:16v",
]

BREAK_MELODY = [
    "r:8 A5:4 C6:4",
    "D6:12v C6:4",
    "E6:8 D6:4 C6:4",
    "A5:16v",
    "r:8 F5:4 A5:4",
    "D6:12v E6:4",
    "G#5:4 B5:4 D6:4 E6:4",
    "G#6:16v",
]


def parse_bar(text, bar):
    notes = []
    pos = bar * 16.0
    for token in text.split():
        name, rest = token.split(":")
        length = float("".join(ch for ch in rest if ch.isdigit() or ch == "."))
        flags = "".join(ch for ch in rest if not (ch.isdigit() or ch == "."))
        if name != "r":
            notes.append((pos, length, note(name), flags))
        pos += length
    assert abs(pos - (bar + 1) * 16) < 1e-6, f"bar {bar + 1}: {text}"
    return notes


def written(lines, first_bar):
    out = []
    for i, text in enumerate(lines):
        out += parse_bar(text, first_bar + i)
    return out


def harmonise(line, steps=2):
    return [(s, l, scale_step(m, steps, BAR_CHORD[int(s // 16)]), f) for s, l, m, f in line]


def octave(line, shift=12):
    return [(s, l, m + shift, f) for s, l, m, f in line]


RHYTHMS = {
    "slow": [[4, 4, 8], [2, 2, 4, 8], [6, 2, 8], [3, 3, 2, 8], [8, 8]],
    "medium": [[2, 2, 2, 2, 4, 4], [1, 1, 2, 2, 2, 4, 4], [3, 1, 2, 2, 4, 4], [3, 3, 2, 2, 2, 4], [1, 1, 1, 1, 2, 2, 8]],
    "fast": [[1] * 8 + [4, 4], [1] * 12 + [4], [1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 4], [2 / 3] * 12 + [8]],
}

# A minor pentatonic, with the Dorian sixth for colour
PENTA = [9, 0, 2, 4, 7, 6]


def improvise(first_bar, bars, density, low, high, seed):
    """Guitar licks in two-bar phrases; every other phrase repeats a motif."""
    r = np.random.default_rng(seed)
    low, high = note(low), note(high)
    notes = []
    current = (low + high) // 2
    motif = None

    def line_for(bar, rhythm, start, contour=None):
        chord = BAR_CHORD[bar]
        pool = sorted(set(m for m in range(low, high + 1) if m % 12 in PENTA or m % 12 in chord_pcs(chord)))
        pool = [m for m in pool if m % 12 in scale_for(chord) or m % 12 in chord_pcs(chord)]
        m = min(pool, key=lambda p: abs(p - start))
        out, steps = [], []
        pos = bar * 16.0
        for i, length in enumerate(rhythm):
            move = contour[i] if contour and i < len(contour) else int(
                r.choice([-2, -1, -1, 1, 1, 2, 3, -3], p=[0.1, 0.22, 0.13, 0.22, 0.13, 0.1, 0.05, 0.05])
            )
            steps.append(move)
            index = pool.index(m) + move
            if index < 0 or index >= len(pool):
                index = pool.index(m) - move
            m = pool[max(0, min(len(pool) - 1, index))]
            if i == len(rhythm) - 1 or length >= 4:
                m = min(pool, key=lambda p: (abs(p - nearest_chord_tone(m, chord)), p))
            flags = ""
            if length >= 4:
                flags = "v" + ("b" if r.random() < 0.35 else "")
            out.append((pos, length, m, flags))
            pos += length
        return out, steps

    for phrase in range(0, bars, 2):
        bar = first_bar + phrase
        if phrase % 4 == 2 and motif:
            line, _ = line_for(bar, motif[0], current, motif[1])
        else:
            rhythm = list(RHYTHMS[density[0]][r.integers(len(RHYTHMS[density[0]]))])
            line, contour = line_for(bar, rhythm, current)
            motif = (rhythm, contour)
        notes += line
        current = line[-1][2]
        if phrase + 1 < bars:
            rhythm = list(RHYTHMS[density[1]][r.integers(len(RHYTHMS[density[1]]))])
            answer, _ = line_for(bar + 1, rhythm, current)
            notes += answer
            current = answer[-1][2]
    return notes


RHYTHMS8 = [[1] * 8, [1, 1, 1, 1, 4], [2 / 3] * 6 + [4], [2, 1, 1, 4], [1, 1, 2, 4]]


def lick(pos, rhythm, start_note, contour, low, high, r):
    """
    One phrase starting at `pos` (in 16ths). With a contour (scale steps
    between notes) it follows that shape, otherwise it makes one up.
    Returns the notes and the contour it used.
    """
    out, steps = [], []
    m = start_note
    for i, length in enumerate(rhythm):
        chord = BAR_CHORD[int(pos // 16) % BARS]
        pool = [
            p for p in range(low, high + 1)
            if (p % 12 in PENTA and p % 12 in scale_for(chord)) or p % 12 in chord_pcs(chord)
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
            m = min(pool, key=lambda p: (abs(p - nearest_chord_tone(m, chord)), p))
        flags = "v" + ("b" if r.random() < 0.3 else "") if length >= 4 else ""
        out.append((pos, length, m, flags))
        pos += length
    return out, steps


def duel(first_bar, turns, turn16, density, low, high, seed):
    """
    The two guitars trading turns of `turn16` sixteenths. The first plays a
    phrase; the second dances back the same rhythm with the shape mirrored.
    Returns (guitar 1 notes, guitar 2 notes).
    """
    r = np.random.default_rng(seed)
    low, high = note(low), note(high)
    g1, g2 = [], []
    current = (low + high) // 2
    rhythm = contour = None
    for t in range(turns):
        pos = first_bar * 16 + t * turn16
        if t % 2 == 0:
            if turn16 == 8:
                rhythm = list(RHYTHMS8[r.integers(len(RHYTHMS8))])
            else:
                rhythm = []
                for b in range(turn16 // 16):
                    level = density[0] if b == 0 else density[1]
                    rhythm += list(RHYTHMS[level][r.integers(len(RHYTHMS[level]))])
            line, contour = lick(pos, rhythm, current, None, low, high, r)
            g1 += line
        else:
            # The answer: same rhythm, the melody turned upside down
            line, _ = lick(pos, rhythm, current, [-c for c in contour], low, high, r)
            g2 += line
        current = line[-1][2]
    return g1, g2


def weave(first_bar, bars, low="A4"):
    """
    Arpeggios split between the guitars note by note, so the line hops from
    one side to the other: up two octaves of the chord and back down.
    """
    g1, g2 = [], []
    for bar in range(first_bar, first_bar + bars):
        tones = chord_notes(BAR_CHORD[bar], note(low), note(low) + 24)[:7]
        seq = (tones + tones[-2:0:-1])
        for i in range(16):
            m = seq[i % len(seq)]
            (g1 if i % 2 == 0 else g2).append((bar * 16 + i, 1, m, ""))
    return g1, g2


def compose():
    """(synth lead, guitar 1, guitar 2, strings melody) note lists."""
    synth, g1, g2, string_line = [], [], [], []
    S = SECTION_START

    # Intro: the guitars call and answer under the filter
    a, b = duel(S["intro"] + 4, 4, 16, ("medium", "medium"), "A4", "E6", 1)
    g1 += a
    g2 += b

    # Groove: the synth hook, then both guitars on it in harmony
    g = S["groove"]
    synth += written(HOOK * 2, g)
    hook = written(HOOK * 2, g + 8)
    g1 += hook
    g2 += harmonise(hook)

    # Chorus: strings on the melody; in the second pass the guitars trade
    # answers, one bar each
    c = S["chorus"]
    string_line += written(CHORUS_MELODY * 2, c)
    a, b = duel(c + 8, 8, 16, ("medium", "slow"), "E5", "A6", 3)
    g1 += a
    g2 += b

    # Solo: the duel, turns getting shorter, then together
    s = S["solo"]
    for first, turns, turn16, density, seed in (
        (s, 4, 32, ("medium", "slow"), 11),
        (s + 8, 4, 16, ("fast", "fast"), 12),
        (s + 12, 4, 8, ("fast", "fast"), 13),
    ):
        a, b = duel(first, turns, turn16, density, "C5", "A6", seed)
        g1 += a
        g2 += b
    together = written(["E6:1 G6:1 A6:1 C7:1 A6:4bv G6:2 E6:2 D6:2 C6:2", "A6:16bv"], s + 14)
    g1 += together
    g2 += harmonise(together, -2)

    # Breakdown: strings alone, then the guitars weave up into the chorus
    k = S["breakdown"]
    string_line += written(BREAK_MELODY, k)
    a, b = weave(k + 6, 2, "E4")
    g1 += a
    g2 += b

    # Chorus 2: twin guitars on the melody, swapping parts halfway
    c2 = S["chorus2"]
    first = written(CHORUS_MELODY, c2)
    g1 += first
    g2 += harmonise(first, -2)
    second = written(CHORUS_MELODY, c2 + 8)
    g2 += second
    g1 += harmonise(second, 2)

    # Outro: weaving arpeggios, the hook in harmony, a last duel, together
    o = S["outro"]
    a, b = weave(o, 8)
    g1 += a
    g2 += b
    hook = written(HOOK, o + 8)
    synth += hook
    g1 += harmonise(hook)
    g2 += harmonise(hook, -2)
    a, b = duel(o + 12, 6, 8, ("fast", "fast"), "E5", "A6", 22)
    g1 += a
    g2 += b
    end = written(["E6:2 D6:2 C6:2 A5:2 G5:2 E5:2 D5:2 E5:2"], o + 15)
    g1 += end
    g2 += harmonise(end)

    def check(notes, name):
        notes = sorted(notes)
        for (s1, l1, *_), (s2, *_) in zip(notes, notes[1:]):
            assert s1 + l1 <= s2 + 1e-6, f"{name}: overlap at bar {s1 // 16 + 1}"
        return notes

    return check(synth, "synth"), check(g1, "guitar 1"), check(g2, "guitar 2"), check(string_line, "strings")


# --- Lead voices -----------------------------------------------------------------


def line_curves(notes, glide_ms, vibrato_depth, vibrato_rate, attack):
    """Per-sample log2 pitch and envelope for a monophonic line."""
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


def render_lead_guitar(notes, bright=False):
    """
    A singing electric lead, overdriven, not distorted to mush. The warm one
    is a neck pickup; the bright one a bridge pickup with more bite.
    """
    freq, amp, onsets = line_curves(notes, 4, 0.4, 6.6 if bright else 5.8, 0.01)
    phase = np.cumsum(2 * np.pi * freq / SR)
    raw = saw(phase, freq) + 0.3 * saw(phase * 1.002, freq)
    picks = np.zeros(len(amp))
    for s0 in onsets:
        add(picks, s0, rng.standard_normal(int(0.005 * SR)) * np.linspace(1, 0, int(0.005 * SR)))
    x = raw * amp + 0.2 * filt(picks, "bandpass", [2000, 6000])
    x = filt(x, "highpass", 400 if bright else 250)
    x = np.tanh((9 if bright else 6) * x)
    x = filt(x, "lowpass", 7500 if bright else 4800, 4)
    x = peak(x, 2800 if bright else 1200, 1.0, 0.7 if bright else 0.5)
    gate = signal.lfilter([0.002], [1, -0.998], (amp > 0).astype(float))
    return filt(x, "highpass", 150) * np.clip(gate * 1.2, 0, 1)


def render_synth_lead(notes):
    """The hook's synth: saw and square, a little glide, filtered."""
    freq, amp, _ = line_curves(notes, 12, 0.25, 5.5, 0.006)
    phase = np.cumsum(2 * np.pi * freq / SR)
    sq = np.zeros_like(phase)
    for k in range(1, 14, 2):
        sq += np.sin(k * phase) / k * ((freq * k) < 14000)
    x = 0.6 * saw(phase, freq) + 0.5 * sq + 0.4 * saw(phase * 1.006, freq)
    x = filt(x * amp, "lowpass", 3800, 2)
    x = peak(x, 1200, 1.5, 0.4)
    return np.tanh(1.5 * x)


def render_string_line(notes):
    """Strings playing a melody: several detuned voices, a soft attack."""
    freq, amp, _ = line_curves(notes, 30, 0.2, 5.0, 0.12)
    out = np.zeros(len(amp))
    for detune in (-0.006, 0.0, 0.007):
        phase = np.cumsum(2 * np.pi * freq * (1 + detune) / SR) + rng.uniform(0, 6)
        out += saw(phase, freq, harmonics=10)
    smooth = signal.lfilter([0.0015], [1, -0.9985], amp)
    return filt(out * smooth, "lowpass", 4500)


# --- Accompaniment -----------------------------------------------------------------


def bass_notes():
    """Octave-jumping disco bass, with walk-ups into chord changes."""
    notes = []
    for bar in range(BARS):
        chord = BAR_CHORD[bar]
        if in_section(bar, "intro") and BAR_INNER[bar] < 4:
            continue
        low = root_of(chord, 1) if root_of(chord, 1) >= note("E1") else root_of(chord, 2)
        nxt = BAR_CHORD[(bar + 1) % BARS]
        base = bar * 16
        if in_section(bar, "breakdown") and BAR_INNER[bar] < 6:
            notes += [(base, 6, low, ""), (base + 6, 2, low + 12, ""), (base + 10, 6, low, "")]
            continue
        for p in range(0, 16, 2):
            notes.append((base + p, 1.6, low + (12 if p % 4 == 2 else 0), ""))
        if nxt != chord:
            # Walk into the next chord on the last two 16ths
            target = root_of(nxt, 1) if root_of(nxt, 1) >= note("E1") else root_of(nxt, 2)
            notes[-1] = (base + 14, 1, low + 7, "")
            notes.append((base + 15, 1, target - 1 if target - 1 > low else low + 10, ""))
    return notes


def render_bass(notes):
    out = track()
    for s16, len16, m, _ in notes:
        f = midi_hz(m)
        length = at(len16) + int(0.02 * SR)
        t = np.arange(length) / SR
        phase = 2 * np.pi * f * t
        tone = saw(phase, np.full(length, f), harmonics=20) + 0.8 * np.sin(phase)
        # A plucked filter: bright on the attack, closing fast
        bright = filt(tone, "lowpass", 2200)
        dark = filt(tone, "lowpass", 380)
        k = np.exp(-t / 0.07)
        sound = k * bright + (1 - k) * dark
        env = (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.5)
        cut = at(len16)
        env[cut:] *= np.exp(-np.arange(length - cut) / (0.008 * SR))
        add(out, at(s16), sound * env)
    return filt(np.tanh(1.8 * out), "highpass", 30)


# The two rhythm guitars interlock: one chops on the beat, the other
# scratches in between, higher up the neck
FUNK_LEFT = "x.m.x.m.x.m.x.mx"
FUNK_RIGHT = ".mx.m.xm.mx.m.xm"


def pluck(freq, length, damp=1.0, seed=0):
    """A plucked string: harmonics that die away, the high ones first."""
    r = np.random.default_rng(seed)
    t = np.arange(length) / SR
    out = np.zeros(length)
    for k in range(1, 16):
        fk = freq * k * (1 + 0.0004 * k * k)
        if fk > 12000:
            break
        weight = abs(np.sin(k * np.pi * 0.22)) / k
        out += weight * np.sin(2 * np.pi * fk * t + r.uniform(0, 6)) * np.exp(-t * (2.5 + 0.9 * k) * damp)
    return out


def render_funk_guitar(seed, pattern, floor):
    """Clean single-coil chicken-scratch: chord chops and muted scratches."""
    r = np.random.default_rng(seed)
    out = track()
    for bar in range(BARS):
        if in_section(bar, "intro") or (in_section(bar, "breakdown") and BAR_INNER[bar] < 6):
            continue
        chord = BAR_CHORD[bar]
        notes = voicing(chord, note(floor), 4)
        for p, kind in enumerate(pattern):
            if kind == ".":
                continue
            start = at(bar * 16 + p) + int(r.uniform(-2, 2) / 1000 * SR)
            down = p % 2 == 0
            order = notes if down else notes[::-1]
            if kind == "x":
                length = int(0.14 * SR)
                for i, m in enumerate(order):
                    s = pluck(midi_hz(m), length, damp=2.2, seed=r.integers(1 << 30))
                    s *= np.exp(-np.arange(length) / (0.06 * SR))
                    add(out, start + int(i * 0.004 * SR), s * 0.6)
            else:
                length = int(0.035 * SR)
                scratch = filt(r.standard_normal(length), "bandpass", [900, 4000]) * np.exp(-np.arange(length) / (0.008 * SR))
                add(out, start, scratch * 0.5)
    x = filt(out, "highpass", 250)
    x = peak(x, 2600, 1.0, 0.7)
    return np.tanh(1.5 * x)


def fm_note(freq, length, velocity=1.0):
    """Electric piano: a sine bell with a decaying FM bark and a tine ping."""
    t = np.arange(length) / SR
    index = (1.8 * velocity) * np.exp(-t / 0.18) + 0.25
    mod = np.sin(2 * np.pi * freq * t)
    tone = np.sin(2 * np.pi * freq * t + index * mod)
    tine = np.sin(2 * np.pi * freq * 14 * t) * np.exp(-t / 0.015) * 0.15
    return (tone + tine) * np.exp(-t / 1.2) * (1 - np.exp(-t / 0.002))


def render_epiano():
    """Syncopated chords on the off-beats, with an auto-pan tremolo."""
    left, right = track(), track()
    for bar in range(BARS):
        if in_section(bar, "intro") and BAR_INNER[bar] < 4:
            continue
        chord = BAR_CHORD[bar]
        notes = voicing(chord, note("G3"), 4)
        hits = [(2, 2), (6, 1), (10, 2), (14, 1)] if not in_section(bar, "breakdown") else [(0, 8), (8, 8)]
        for p, length16 in hits:
            length = at(length16) + int(0.15 * SR)
            chord_sound = sum(fm_note(midi_hz(m), length, 0.8) for m in notes)
            cut = at(length16)
            chord_sound[cut:] *= np.exp(-np.arange(length - cut) / (0.05 * SR))
            start = at(bar * 16 + p)
            add(left, start, chord_sound)
            add(right, start, chord_sound)
    t = np.arange(LOOP + TAIL) / SR
    pan = 0.5 + 0.35 * np.sin(2 * np.pi * (BPM / 60 / 2) * t)
    return left * pan, right * (1 - pan)


def render_strings_pad():
    """Lush string chords on the chorus, solo and breakdown, with stabs and swoops."""
    left, right = track(), track()
    for bar in range(BARS):
        sec = BAR_SECTION[bar]
        chord = BAR_CHORD[bar]
        notes = voicing(chord, note("A3"), 4, skip_root=False)
        start, length16, attack = None, 16, 0.15
        if sec in ("chorus", "chorus2", "breakdown", "solo") or (sec == "intro"):
            start = bar * 16
        elif sec in ("groove", "outro"):
            # Stabs: short, punchy, on the one and the "and" of three
            for p in (0, 10):
                length = at(1.5) + int(0.12 * SR)
                t = np.arange(length) / SR
                env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.18)
                for i, m in enumerate(notes + [notes[0] + 12]):
                    # Two slightly detuned bright voices per note
                    stab = sum(
                        np.sin(2 * np.pi * midi_hz(m) * (1 + d) * t * k) / k
                        for d in (-0.005, 0.005)
                        for k in range(1, 8)
                    )
                    add(left if i % 2 else right, at(bar * 16 + p), stab * env * 0.5)
            continue
        if start is None:
            continue
        length = at(length16) + int(0.4 * SR)
        t = np.arange(length) / SR
        env = (1 - np.exp(-t / attack))
        cut = at(length16)
        env[cut:] *= np.exp(-np.arange(length - cut) / (0.25 * SR))
        for i, m in enumerate(notes):
            voices = sum(
                saw(2 * np.pi * midi_hz(m) * (1 + d) * t + rng.uniform(0, 6), np.full(length, midi_hz(m)), harmonics=10)
                for d in (-0.007, 0.0, 0.006)
            )
            add(left if i % 2 == 0 else right, at(start), voices * env * 0.6)
            add(right if i % 2 == 0 else left, at(start), voices * env * 0.25)

        # A swoop up into each chorus
        nxt = (bar + 1) % BARS
        if BAR_SECTION[nxt] in ("chorus", "chorus2") and BAR_INNER[nxt] == 0:
            length = at(8)
            t = np.arange(length) / SR
            f0, f1 = midi_hz(note("A4")), midi_hz(note("A6"))
            freq = f0 * (f1 / f0) ** ((t / t[-1]) ** 1.5)
            phase = np.cumsum(2 * np.pi * freq / SR)
            sweep = sum(saw(phase * (1 + d), freq, harmonics=8) for d in (-0.006, 0.006)) * np.linspace(0.2, 1, length)
            add(left, at(bar * 16 + 8), sweep * 0.5)
            add(right, at(bar * 16 + 8), sweep * 0.5)

    return filt(left, "lowpass", 7500), filt(right, "lowpass", 7500)


# --- Drum machine ------------------------------------------------------------------


def kick():
    t = np.arange(int(0.4 * SR)) / SR
    f = 48 + 140 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = filt(rng.standard_normal(len(t)), "highpass", 2000) * np.exp(-t * 300) * 0.4
    return np.tanh(1.6 * (body + click))


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = filt(rng.standard_normal(n), "bandpass", [900, 4500])
    env = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) / 0.007), 0) * (t >= d)
    env += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.09), 0) * 0.6
    snare_body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.4
    return noise * env + snare_body


def metallic(length_s, decay):
    """808-style hat: square waves at clashing pitches, high-passed."""
    t = np.arange(int(length_s * SR)) / SR
    tone = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (263, 400, 421, 474, 587, 845))
    return filt(tone, "highpass", 7000) * np.exp(-t / decay)


def tambourine():
    t = np.arange(int(0.18 * SR)) / SR
    jingles = filt(rng.standard_normal(len(t)), "bandpass", [6000, 11000])
    return jingles * (np.exp(-t / 0.05) + 0.3 * np.exp(-((t - 0.02) ** 2) / 0.0002))


def syn_tom(f0):
    """The disco "pew": a sine that drops in pitch."""
    t = np.arange(int(0.45 * SR)) / SR
    f = f0 * np.exp(-t * 4.5) + f0 * 0.25
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) + filt(rng.standard_normal(len(t)), "highpass", 3000) * np.exp(-t * 80) * 0.2


def crash():
    t = np.arange(int(2.2 * SR)) / SR
    return filt(rng.standard_normal(len(t)), "highpass", 5000) * np.exp(-t * 1.8)


def render_drums():
    k, cl, ch, oh, tb, cr = kick(), clap(), metallic(0.05, 0.012), metallic(0.3, 0.09), tambourine(), crash()
    toms = [syn_tom(f) for f in (620, 520, 430, 360)]
    kicks, claps, hats, perc = track(), track(), track(), track()
    kick_times = []

    for bar in range(BARS):
        sec = BAR_SECTION[bar]
        inner = BAR_INNER[bar]
        base = bar * 16
        nxt_sec = BAR_SECTION[(bar + 1) % BARS]
        section_ends = nxt_sec != sec
        fill = (bar + 1) % 8 == 0 or section_ends

        breakdown_quiet = sec == "breakdown" and inner < 6
        intro_sparse = sec == "intro" and inner < 4
        stop = 12 if fill else 16

        # Four on the floor
        if not breakdown_quiet:
            for p in range(0, stop, 4):
                add(kicks, at(base + p), k)
                kick_times.append(at(base + p))

        if not intro_sparse:
            for p in (4, 12):
                if p < stop or not fill:
                    add(claps, at(base + p), cl)
            for p in (4, 12):
                add(perc, at(base + p + 2), tb * 0.6)

        # Open hat on every off-beat: the disco "tss"
        for p in (2, 6, 10, 14):
            add(hats, at(base + p), oh * (0.5 if intro_sparse else 1.0))
        # Closed hats on the 16ths in between
        if not intro_sparse:
            for p in range(16):
                if p % 2 == 1:
                    add(hats, at(base + p), ch * (0.6 if p % 4 == 1 else 0.45))

        if inner % 8 == 0 and not breakdown_quiet:
            add(perc, at(base), cr * (1.0 if inner == 0 else 0.6))

        if sec == "breakdown" and inner >= 6:
            # Build: claps in 8ths, then 16ths
            for p in range(0, 16, 2 if inner == 6 else 1):
                add(claps, at(base + p), cl * (0.3 + 0.7 * p / 16))

        if fill and not (sec == "breakdown" and inner >= 6):
            # "Pew pew pew pew"
            for i, p in enumerate((12, 13, 14, 15) if not section_ends else (8, 10, 12, 13, 14, 15)):
                add(perc, at(base + p), toms[min(3, i * 4 // (4 if not section_ends else 6))] * 0.9)

    return kicks, claps, hats, perc, kick_times


def pump(kick_times, depth=0.35, release=0.16):
    """A gain curve that ducks on every kick: the sidechain pump."""
    n = LOOP + TAIL
    g = np.ones(n)
    shape = 1 - depth * np.exp(-np.arange(int(0.5 * SR)) / (release * SR))
    for t0 in kick_times:
        end = min(n, t0 + len(shape))
        g[t0:end] = np.minimum(g[t0:end], shape[: end - t0])
    return g


def filter_sweeps():
    """How open the music's filter is (0..1): rising through the intro, down for the breakdown."""
    n = LOOP + TAIL
    w = np.ones(n)
    a, b = at(SECTION_START["intro"] * 16), at((SECTION_START["intro"] + 8) * 16)
    w[a:b] = np.linspace(0, 1, b - a) ** 1.5
    a = at(SECTION_START["breakdown"] * 16)
    mid = at((SECTION_START["breakdown"] + 2) * 16)
    b = at((SECTION_START["breakdown"] + 8) * 16)
    w[a:mid] = np.linspace(1, 0.15, mid - a)
    w[mid:b] = np.linspace(0.15, 1, b - mid) ** 2
    # The filter closes over the last beat, so the end meets the closed intro
    last_beat = at(4)
    w[LOOP - last_beat : LOOP] = np.linspace(1, 0, last_beat) ** 0.5
    # Ringing that folds back onto the start is filtered like the start
    w[LOOP:] = w[:TAIL]
    return w


# --- Mix ---------------------------------------------------------------------------


def reverb_ir(seconds, seed):
    r = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    ir = r.standard_normal(len(t)) * np.exp(-t * 7 / seconds)
    ir = filt(ir, "lowpass", 7000)
    ir[: int(0.015 * SR)] = 0
    return ir / np.sqrt(np.sum(ir**2))


def delay(x, time16, feedback, mix):
    d = at(time16)
    out = x.copy()
    echo = x.copy()
    for _ in range(6):
        echo = np.concatenate([np.zeros(d), echo[:-d]]) * feedback
        out += echo * mix / feedback
    return out


def render():
    synth, guitar1, guitar2, string_line = compose()
    print(f"synth {len(synth)} notes, guitar 1 {len(guitar1)}, guitar 2 {len(guitar2)}, strings {len(string_line)}")
    n = LOOP + TAIL
    music_l, music_r = np.zeros(n), np.zeros(n)
    send = np.zeros(n)

    def put(x, gl, gr, rev=0.0):
        nonlocal music_l, music_r, send
        music_l += gl * x
        music_r += gr * x
        if rev:
            send += rev * x

    print("drums")
    kicks, claps, hats, perc, kick_times = render_drums()
    kicks, claps, hats, perc = norm(kicks), norm(claps), norm(hats), norm(perc)
    g = pump(kick_times)

    print("bass"); x = norm(render_bass(bass_notes())); put(x * g, 0.34, 0.34); del x
    print("rhythm guitars"); x = norm(render_funk_guitar(5, FUNK_LEFT, "D4")); put(x * g, 0.40, 0.03, 0.1)
    x2 = norm(render_funk_guitar(6, FUNK_RIGHT, "A4")); put(x2 * g, 0.03, 0.36, 0.1); del x, x2
    print("piano"); el, er = render_epiano(); s = np.max(np.abs(el + er)); put(el * g / s, 0.50, 0, 0.3); put(er * g / s, 0, 0.50, 0.3); del el, er
    print("strings"); sl, sr_ = render_strings_pad(); s = np.max(np.abs(sl + sr_)); put(sl * g / s, 0.48, 0, 0.5); put(sr_ * g / s, 0, 0.48, 0.5); del sl, sr_
    x = norm(render_string_line(string_line)); put(x * g, 0.30, 0.30, 0.6); del x
    print("leads")
    x = norm(delay(norm(render_synth_lead(synth)), 3, 0.3, 0.25)); put(x, 0.36, 0.30, 0.3); del x
    # The two dancers: warm on the left, bright on the right, each echoing
    # a little on the other side
    x = norm(delay(norm(render_lead_guitar(guitar1)), 3, 0.3, 0.2)); put(x, 0.46, 0.16, 0.4); del x
    x = norm(delay(norm(render_lead_guitar(guitar2, bright=True)), 3, 0.3, 0.2)); put(x, 0.14, 0.44, 0.4); del x

    print("reverb")
    rl = signal.oaconvolve(send, reverb_ir(2.0, 1))[:n]
    rr = signal.oaconvolve(send, reverb_ir(2.0, 2))[:n]
    music_l += 0.25 * rl
    music_r += 0.25 * rr
    del rl, rr, send

    # The filter sweep on everything but the drums
    w = filter_sweeps()
    for ch in (music_l, music_r):
        dark = filt(ch, "lowpass", 450)
        ch *= w
        ch += (1 - w) * dark

    clap_rev = signal.oaconvolve(claps, reverb_ir(1.2, 3))[:n] * 0.12
    # Hats a little right, tambourine and toms a little left: space for the groove
    left = music_l + 0.70 * kicks + 0.55 * claps + clap_rev + 0.60 * hats + 0.48 * perc
    right = music_r + 0.70 * kicks + 0.55 * claps + clap_rev + 0.75 * hats + 0.36 * perc

    out = []
    for ch in (left, right):
        looped = ch[:LOOP].copy()
        looped[:TAIL] += ch[LOOP:]
        out.append(looped)
    master = np.stack(out, axis=1)
    # A little sheen on top: disco should sparkle
    for i in range(2):
        master[:, i] += 0.5 * filt(master[:, i], "highpass", 6000)
    master = master / np.percentile(np.abs(master), 99.7)
    master = np.tanh(1.05 * master)
    return master / np.max(np.abs(master)) * 0.93


if __name__ == "__main__":
    from scipy.io import wavfile

    folder = sys.argv[1]
    os.makedirs(folder, exist_ok=True)
    audio = (render() * 32767).astype(np.int16)
    wavfile.write(os.path.join(folder, "full.wav"), SR, audio)
    parts = []
    for i in range(PARTS):
        a, b = at(i * BARS_PER_PART * 16), at((i + 1) * BARS_PER_PART * 16)
        idx = np.arange(a - PAD, b + PAD) % LOOP
        wavfile.write(os.path.join(folder, f"battle-{i + 1}.wav"), SR, audio[idx])
        parts.append({"file": f"battle-{i + 1}.mp3", "samples": b - a})
    with open(os.path.join(folder, "music.json"), "w") as f:
        json.dump({"title": "Hole in Fun", "sampleRate": SR, "pad": PAD, "parts": parts}, f, indent=2)
    print(f"song: {LOOP} samples = {LOOP / SR:.3f} s in {PARTS} parts")
