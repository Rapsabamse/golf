"""
"Neon Fairway": synthwave for GOLF - golf. 64 bars at 112 BPM in D minor.

Driving pulse bass, a 16th-note arpeggiator, warm pads, big gated-reverb
drums, a soaring synth lead and an 80s guitar solo. It starts with the
filter closed and opens up, and ends by thinning out with the filter
closing, so it fades in and out of the other tracks.

    Intro    8  pads and the arpeggiator opening up; drums and bass join
    Verse   16  the synth lead's moody melody
    Chorus  16  four on the floor, the big melody
    Solo    16  80s guitar solo
    Outro    8  the chorus once more, then everything thins out

    python3 tools/music/synthwave.py out-folder
"""

import sys

import numpy as np

import common as C
from common import at, add, note, filt, saw, square, midi_hz, norm, written, check

C.setup(bpm=112, bars=64, parts=4, seed=112)

song = C.Song(
    chords={
        "Dm": ("D", ["D", "F", "A"]),
        "Bb": ("Bb", ["Bb", "D", "F"]),
        "F": ("F", ["F", "A", "C"]),
        "C": ("C", ["C", "E", "G"]),
    },
    scale=lambda chord: [2, 4, 5, 7, 9, 10, 0],  # D natural minor
    licks=[2, 5, 7, 9, 0],  # D minor pentatonic
)
PROG = ["Dm", "Bb", "F", "C"]
for name, bars in (("intro", 8), ("verse", 16), ("chorus", 16), ("solo", 16), ("outro", 8)):
    song.add_section(name, [PROG[i % 4] for i in range(bars)])
song.done()
S = song.section_start

VERSE = [
    "A4:4 D5:4 F5:4 E5:4",
    "D5:12v C5:4",
    "C5:4 F5:4 A5:4 G5:4",
    "E5:12v G5:4",
    "A5:6 G5:2 F5:4 E5:4",
    "F5:4 D5:4 Bb4:8v",
    "A4:4 C5:4 F5:4 A5:4",
    "G5:16v",
]

CHORUS = [
    "D6:6 C6:2 A5:8v",
    "Bb5:4 A5:4 F5:8v",
    "F5:2 G5:2 A5:4 C6:4 F6:4",
    "E6:12v D6:2 C6:2",
    "D6:4 F6:4 E6:4 D6:4",
    "C6:4 D6:4 F6:8v",
    "A6:6 G6:2 F6:4 C6:4",
    "E6:8v G6:8v",
]


def section(bar):
    return song.bar_section[bar], song.bar_inner[bar]


def compose():
    lead, guitar = [], []
    lead += written(VERSE * 2, S["verse"])
    lead += written(CHORUS, S["chorus"])
    # Second time round it ends climbing, into the solo
    lead += written(CHORUS[:7] + ["E6:8v G6:4 A6:4"], S["chorus"] + 8)
    s = S["solo"]
    guitar += song.improvise(s, 8, ("slow", "medium"), "A4", "D6", 31)
    guitar += song.improvise(s + 8, 6, ("medium", "fast"), "D5", "A6", 32)
    guitar += written(["D6:1 F6:1 G6:1 A6:1 C7:4bv A6:2 G6:2 F6:2 E6:2", "D6:16bv"], s + 14)
    lead += written(CHORUS[:4] + ["D6:16v"], S["outro"])
    return check(lead, "lead"), check(guitar, "guitar")


# --- Instruments ----------------------------------------------------------------


def render_pulse_bass():
    """Sixteenth-note pulse on the root, octave on the off-beats."""
    out = C.track()
    for bar in range(C.BARS):
        sec, inner = section(bar)
        if sec == "intro" and inner < 4:
            continue
        if sec == "outro" and inner >= 6:
            continue
        root = song.root(song.bar_chord[bar], 2)
        if root > note("F2"):
            root -= 12
        for p in range(16):
            m = root + (12 if p % 4 == 2 else 0)
            f = midi_hz(m)
            length = at(0.9)
            t = np.arange(length) / C.SR
            tone = saw(2 * np.pi * f * t, f, harmonics=16) + 0.6 * np.sin(2 * np.pi * f * t)
            bright = filt(tone, "lowpass", 1800)
            dark = filt(tone, "lowpass", 300)
            k = np.exp(-t / 0.035)
            env = (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.15)
            add(out, at(bar * 16 + p), (k * bright + (1 - k) * dark) * env * (1.0 if p % 4 == 0 else 0.8))
    return filt(np.tanh(1.6 * out), "highpass", 32)


def render_arp():
    """The arpeggiator: chord tones in 16ths, a square pluck, echoing."""
    out = C.track()
    for bar in range(C.BARS):
        chord = song.bar_chord[bar]
        tones = song.chord_notes(chord, note("D4"), note("D6"))[:6]
        pattern = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 1, 2]
        for p, i in enumerate(pattern):
            f = midi_hz(tones[i % len(tones)])
            length = int(0.16 * C.SR)
            t = np.arange(length) / C.SR
            tone = square(2 * np.pi * f * t, f) * 0.7 + saw(2 * np.pi * f * 1.004 * t, f) * 0.3
            k = np.exp(-t / 0.04)
            sound = (k * filt(tone, "lowpass", 4000) + (1 - k) * filt(tone, "lowpass", 900)) * np.exp(-t / 0.08)
            add(out, at(bar * 16 + p), sound * (1.0 if p % 4 == 0 else 0.75))
    return out


def render_pad():
    """Warm detuned saws, slow to swell; left and right voices differ."""
    left, right = C.track(), C.track()
    for bar in range(C.BARS):
        chord = song.bar_chord[bar]
        notes = song.voicing(chord, note("D3"), 4, skip_root=False) + [song.root(chord, 4)]
        length = at(16) + int(0.6 * C.SR)
        t = np.arange(length) / C.SR
        env = 1 - np.exp(-t / 0.35)
        cut = at(16)
        env[cut:] *= np.exp(-np.arange(length - cut) / (0.3 * C.SR))
        for i, m in enumerate(notes):
            f = midi_hz(m)
            wobble = 1 + 0.002 * np.sin(2 * np.pi * 0.4 * t + i)
            phase = np.cumsum(2 * np.pi * f * wobble / C.SR)
            for d, side in ((-0.006, left), (0.005, right), (0.0, left if i % 2 else right)):
                add(side, at(bar * 16), saw(phase * (1 + d) + C.rng.uniform(0, 6), f, harmonics=10) * env * 0.3)
    return filt(left, "lowpass", 2600), filt(right, "lowpass", 2600)


def render_drums():
    k, sn, hat, oh, cr = C.kick(1.3, 0.45), C.gated_snare(), C.metallic(0.05, 0.012), C.metallic(0.3, 0.08), C.crash()
    toms = [C.tom(f, 0.5) for f in (300, 240, 190, 150)]
    kicks, snares, hats, perc = C.track(), C.track(), C.track(), C.track()
    kick_times = []
    for bar in range(C.BARS):
        sec, inner = section(bar)
        base = bar * 16
        nxt_sec = song.bar_section[(bar + 1) % C.BARS]
        fill = ((bar + 1) % 8 == 0 or nxt_sec != sec) and sec != "outro"
        stop = 12 if fill else 16
        if sec == "intro" and inner < 4:
            # Just a ticking hat while the filter opens
            for p in range(0, 16, 2):
                add(hats, at(base + p), hat * 0.5)
            continue
        if sec == "outro" and inner >= 4:
            # Thinning out: the kick goes first, then the snare
            if inner < 6:
                for p in (4, 12):
                    add(snares, at(base + p), sn * 0.7)
            for p in range(0, 16, 2):
                add(hats, at(base + p), hat * (0.5 if inner >= 6 else 0.8))
            continue
        kick_at = [0, 4, 8, 12] if sec in ("chorus", "solo") else [0, 8, 10]
        for p in kick_at:
            if p < stop:
                add(kicks, at(base + p), k)
                kick_times.append(at(base + p))
        for p in (4, 12):
            if p < stop:
                add(snares, at(base + p), sn)
        step = 1 if sec in ("chorus", "solo") else 2
        for p in range(0, stop, step):
            add(hats, at(base + p), hat * (1.0 if p % 4 == 2 else 0.6))
        if sec == "chorus":
            for p in (2, 6, 10, 14):
                add(hats, at(base + p), oh * 0.5)
        if inner % 4 == 0:
            add(perc, at(base), cr * (1.0 if inner == 0 else 0.6))
        if fill:
            for i, p in enumerate((12, 13, 14, 15)):
                add(perc, at(base + p), toms[i])
    return kicks, snares, hats, perc, kick_times


def filter_open():
    """0..1: opening over the intro, closing over the last four bars."""
    n = C.LOOP + C.TAIL
    w = np.ones(n)
    a, b = 0, at(8 * 16)
    w[a:b] = np.linspace(0, 1, b - a) ** 1.5
    a, b = at((C.BARS - 4) * 16), C.LOOP
    w[a:b] = np.linspace(1, 0, b - a) ** 0.7
    w[C.LOOP:] = w[: C.TAIL]
    return w


def render():
    lead, guitar = compose()
    print(f"lead {len(lead)} notes, guitar {len(guitar)}")
    n = C.LOOP + C.TAIL
    L, R, send = np.zeros(n), np.zeros(n), np.zeros(n)

    kicks, snares, hats, perc, kick_times = render_drums()
    g = C.pump(kick_times, depth=0.25, release=0.2)

    x = norm(render_pulse_bass()); L += 0.40 * x * g; R += 0.40 * x * g
    x = norm(C.delay(norm(render_arp()), 3, 0.35, 0.3))
    L += 0.22 * x * g; R += 0.12 * x * g; send += 0.2 * x
    pl, pr = render_pad(); s = np.max(np.abs(pl + pr)); L += 0.5 * pl * g / s; R += 0.5 * pr * g / s; send += 0.3 * (pl + pr) / s
    x = norm(C.delay(norm(C.render_synth_lead(lead, glide_ms=30, cutoff=5000)), 6, 0.3, 0.25))
    L += 0.40 * x; R += 0.40 * x; send += 0.6 * x
    x = norm(C.delay(norm(C.render_lead_guitar(guitar, drive=8)), 3, 0.3, 0.2))
    L += 0.42 * x; R += 0.36 * x; send += 0.5 * x

    rl, rr = C.stereo_reverb(send, 2.6)
    L += 0.28 * rl
    R += 0.28 * rr

    w = filter_open()
    L, R = C.swept(L, w), C.swept(R, w)

    kicks, snares, hats, perc = norm(kicks), norm(snares), norm(hats), norm(perc)
    L += 0.75 * kicks + 0.6 * snares + 0.35 * hats + 0.4 * perc
    R += 0.75 * kicks + 0.6 * snares + 0.42 * hats + 0.36 * perc
    return C.master(L, R, sheen=0.35)


if __name__ == "__main__":
    C.write_parts(sys.argv[1], "synthwave", "Neon Fairway", render())
