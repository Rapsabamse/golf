"""
"Hole in One Rush": Eurobeat for GOLF - golf. 96 bars at 156 BPM in F# minor.

A supersaw riff, synth brass stabs, rolling bass, bright piano, a build
into an anthem chorus and a shred guitar solo. It starts with the riff
behind a closed filter and ends with the riff thinning out the same way,
so it fades in and out of the other tracks.

    Intro    8  the riff behind a filter that opens, drums building
    Riff    16  the full riff with brass stabs
    Verse   16  the synth melody, piano chords
    Build    8  snare roll and a noise riser
    Chorus  16  the anthem, doubled an octave down
    Solo    16  shred guitar: runs, sweeps, a climb
    Riff     8  the riff once more
    Outro    8  the riff fading behind the filter

    python3 tools/music/eurobeat.py out-folder
"""

import sys

import numpy as np

import common as C
from common import at, add, note, filt, saw, midi_hz, norm, written, octave, check

C.setup(bpm=156, bars=96, parts=4, seed=156)

F_SHARP_MINOR = [6, 8, 9, 11, 1, 2, 4]
song = C.Song(
    chords={
        "F#m": ("F#", ["F#", "A", "C#"]),
        "D": ("D", ["D", "F#", "A"]),
        "E": ("E", ["E", "G#", "B"]),
        "C#": ("C#", ["C#", "F", "G#"]),  # F here is E#, the major third
    },
    # Over C# the scale borrows E# (harmonic minor)
    scale=lambda chord: [6, 8, 9, 11, 1, 2, 5] if chord == "C#" else F_SHARP_MINOR,
    licks=[6, 9, 11, 1, 4],  # F# minor pentatonic
)
RIFF_PROG = ["F#m", "D", "E", "C#"]
CHORUS_PROG = ["D", "E", "F#m", "C#"]
BUILD_PROG = ["D", "E", "D", "E", "C#", "C#", "C#", "C#"]
for name, bars, prog in (
    ("intro", 8, RIFF_PROG),
    ("riff", 16, RIFF_PROG),
    ("verse", 16, RIFF_PROG),
    ("build", 8, BUILD_PROG),
    ("chorus", 16, CHORUS_PROG),
    ("solo", 16, RIFF_PROG),
    ("riff2", 8, RIFF_PROG),
    ("outro", 8, RIFF_PROG),
):
    song.add_section(name, [prog[i % len(prog)] for i in range(bars)])
song.done()
S = song.section_start

RIFF = [
    "F#5:1 A5:1 C#6:1 A5:1 F#5:1 A5:1 C#6:1 E6:1 F#6:2 E6:1 C#6:1 A5:2 C#6:2",
    "D6:1 C#6:1 A5:1 F#5:1 D6:1 C#6:1 A5:1 F#5:1 A5:2 B5:2 C#6:2 D6:2",
    "E6:1 B5:1 G#5:1 B5:1 E6:1 B5:1 G#5:1 B5:1 E6:2 F#6:2 G#6:2 E6:2",
    "F6:2 C#6:1 G#5:1 F5:2 G#5:2 C#6:4v D#6:2 F6:2",
]

VERSE = [
    "C#5:4 F#5:4 A5:4 G#5:2 F#5:2",
    "F#5:6 E5:2 D5:8v",
    "E5:4 G#5:4 B5:4 A5:2 G#5:2",
    "G#5:12v F5:4",
    "F#5:2 G#5:2 A5:4 C#6:4 B5:2 A5:2",
    "A5:4 F#5:4 D6:8v",
    "B5:4 G#5:4 E5:4 G#5:4",
    "G#5:16v",
]

CHORUS = [
    "F#6:4 E6:4 D6:4 C#6:4",
    "B5:4 C#6:4 E6:8v",
    "F#6:6 E6:2 C#6:4 A5:4",
    "G#5:4 C#6:4 F6:8v",
    "F#6:4 A6:4 F#6:4 E6:4",
    "E6:4 G#6:4 B6:8v",
    "A6:6 G#6:2 F#6:4 C#6:4",
    "C#6:4 F6:4 G#6:8v",
]


def section(bar):
    return song.bar_section[bar], song.bar_inner[bar]


def compose():
    saw_lead, synth, guitar = [], [], []
    saw_lead += written(RIFF * 2, S["intro"])
    saw_lead += written(RIFF * 4, S["riff"])
    synth += written(VERSE * 2, S["verse"])
    saw_lead += written(CHORUS * 2, S["chorus"])
    synth += octave(written(CHORUS * 2, S["chorus"]), -12)

    s = S["solo"]
    guitar += song.improvise(s, 4, ("fast", "medium"), "C#5", "F#6", 41)
    for bar in range(s + 4, s + 8):
        guitar += song.sweeps(bar, "F#4", "C#6")
    guitar += song.improvise(s + 8, 6, ("shred", "fast"), "C#5", "A6", 42)
    guitar += written(
        ["F#5:1 G#5:1 A5:1 B5:1 C#6:1 D6:1 E6:1 F#6:1 G#6:1 A6:1 B6:1 C#7:1 B6:4bv", "C#7:16bv"],
        s + 14,
    )
    saw_lead += written(RIFF * 2, S["riff2"])
    saw_lead += written(RIFF * 2, S["outro"])
    return check(saw_lead, "supersaw"), check(synth, "synth"), check(guitar, "guitar")


# --- Instruments ----------------------------------------------------------------


def render_bass():
    """Rolling bass: the three 16ths after each kick, octave in the middle."""
    out = C.track()
    for bar in range(C.BARS):
        sec, inner = section(bar)
        if sec == "intro" and inner < 4 or sec == "outro" and inner >= 4:
            continue
        root = song.root(song.bar_chord[bar], 1)
        if root < note("C#1"):
            root += 12
        for beat in range(4):
            for off in (1, 2, 3):
                m = root + (12 if off == 2 else 0)
                f = midi_hz(m)
                length = at(0.9)
                t = np.arange(length) / C.SR
                tone = saw(2 * np.pi * f * t, f, harmonics=18) + 0.7 * np.sin(2 * np.pi * f * t)
                k = np.exp(-t / 0.03)
                sound = k * filt(tone, "lowpass", 2400) + (1 - k) * filt(tone, "lowpass", 420)
                env = (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.12)
                add(out, at(bar * 16 + beat * 4 + off), sound * env)
    return filt(np.tanh(1.7 * out), "highpass", 34)


def render_brass():
    """Synth brass stabs: bright on the attack, closing fast, syncopated."""
    left, right = C.track(), C.track()
    for bar in range(C.BARS):
        sec, inner = section(bar)
        if sec not in ("riff", "chorus", "riff2", "build"):
            continue
        chord = song.bar_chord[bar]
        notes = song.voicing(chord, note("F#4"), 3, skip_root=False) + [song.root(chord, 5)]
        hits = (0, 3, 6, 10) if sec != "build" else (0, 4, 8, 12)
        for p in hits:
            length = at(1.5) + int(0.1 * C.SR)
            t = np.arange(length) / C.SR
            k = np.exp(-t / 0.05)
            env = (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.2)
            for i, m in enumerate(notes):
                f = midi_hz(m)
                tone = sum(saw(2 * np.pi * f * (1 + d) * t, f, harmonics=12) for d in (-0.004, 0.004))
                sound = (k * filt(tone, "lowpass", 5000) + (1 - k) * filt(tone, "lowpass", 1200)) * env
                add(left if i % 2 else right, at(bar * 16 + p), sound * 0.6)
                add(right if i % 2 else left, at(bar * 16 + p), sound * 0.3)
    return left, right


def fm_piano(freq, length):
    """A bright electric grand: FM bark on the attack."""
    t = np.arange(length) / C.SR
    index = 2.5 * np.exp(-t / 0.1) + 0.4
    tone = np.sin(2 * np.pi * freq * t + index * np.sin(2 * np.pi * freq * 2 * t))
    return tone * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.002))


def render_piano():
    out = C.track()
    for bar in range(C.BARS):
        sec, _ = section(bar)
        if sec not in ("verse", "chorus"):
            continue
        chord = song.bar_chord[bar]
        notes = song.voicing(chord, note("C#4"), 3, skip_root=False) + [song.root(chord, 5)]
        for p in (0, 4, 8, 12) if sec == "chorus" else (0, 6, 10):
            length = at(4) + int(0.2 * C.SR)
            add(out, at(bar * 16 + p), sum(fm_piano(midi_hz(m), length) for m in notes))
    return out


def render_drums():
    k, cl, sn, ch, oh, cr = C.kick(1.4, 0.35), C.clap(), C.snare(220), C.metallic(0.05, 0.012), C.metallic(0.3, 0.09), C.crash()
    toms = [C.tom(f, 0.35) for f in (260, 210, 170, 130)]
    kicks, snares, hats, perc = C.track(), C.track(), C.track(), C.track()
    kick_times = []
    for bar in range(C.BARS):
        sec, inner = section(bar)
        base = bar * 16
        nxt_sec = song.bar_section[(bar + 1) % C.BARS]
        fill = ((bar + 1) % 8 == 0 or nxt_sec != sec) and sec not in ("build", "outro")

        if sec == "intro" and inner < 4:
            # Soft at first, for fading in: hats, then the kick joins quietly
            for p in (2, 6, 10, 14):
                add(hats, at(base + p), oh * 0.5)
            if inner >= 2:
                for p in (0, 4, 8, 12):
                    add(kicks, at(base + p), k * (0.4 + 0.15 * (inner - 2)))
                    kick_times.append(at(base + p))
            continue
        if sec == "outro" and inner >= 4:
            for p in range(0, 16, 2):
                add(hats, at(base + p), (oh if p % 4 == 2 else ch) * (0.7 if inner < 6 else 0.4))
            continue

        stop = 12 if fill else 16
        for p in range(0, stop, 4):
            add(kicks, at(base + p), k)
            kick_times.append(at(base + p))

        if sec == "build":
            # Snare roll: quarters, then 8ths, then 16ths, rising
            step = 4 if inner < 4 else 2 if inner < 6 else 1
            for p in range(0, 16, step):
                add(snares, at(base + p), sn * (0.3 + 0.7 * (inner * 16 + p) / 128))
        else:
            for p in (4, 12):
                if p < stop:
                    add(snares, at(base + p), cl * 0.8)
                    add(snares, at(base + p), sn * 0.5)

        for p in (2, 6, 10, 14):
            add(hats, at(base + p), oh)
        for p in range(1, 16, 2):
            add(hats, at(base + p), ch * 0.5)

        if inner % 4 == 0:
            add(perc, at(base), cr * (1.0 if inner == 0 else 0.7))
        if fill:
            for i, p in enumerate((12, 13, 14, 15)):
                add(perc, at(base + p), toms[i])

    noise, start = C.riser(8, S["build"])
    add(perc, start, noise * 0.5)
    return kicks, snares, hats, perc, kick_times


def filter_open():
    """0..1: opening over the intro, closing over the outro."""
    n = C.LOOP + C.TAIL
    w = np.ones(n)
    a, b = 0, at(8 * 16)
    w[a:b] = np.linspace(0, 1, b - a) ** 1.5
    a, b = at(S["outro"] * 16), C.LOOP
    w[a:b] = np.linspace(1, 0, b - a) ** 0.8
    # The build closes it a little, then flings it open for the chorus
    a, b = at(S["build"] * 16), at(S["chorus"] * 16)
    w[a:b] = 0.55 + 0.45 * np.linspace(0, 1, b - a) ** 2
    w[C.LOOP:] = w[: C.TAIL]
    return w


def render():
    saw_lead, synth, guitar = compose()
    print(f"supersaw {len(saw_lead)} notes, synth {len(synth)}, guitar {len(guitar)}")
    n = C.LOOP + C.TAIL
    L, R, send = np.zeros(n), np.zeros(n), np.zeros(n)

    kicks, snares, hats, perc, kick_times = render_drums()
    g = C.pump(kick_times, depth=0.3, release=0.12)

    x = norm(render_bass()); L += 0.40 * x * g; R += 0.40 * x * g
    bl, br = render_brass(); s = np.max(np.abs(bl + br)); L += 0.40 * bl * g / s; R += 0.40 * br * g / s; send += 0.2 * (bl + br) / s
    x = norm(render_piano()); L += 0.22 * x * g; R += 0.26 * x * g; send += 0.3 * x
    sl, sr_ = C.render_supersaw(saw_lead, voices=5, spread=0.014, cutoff=7000)
    s = np.max(np.abs(sl + sr_))
    sl, sr_ = C.delay(sl / s, 3, 0.25, 0.2), C.delay(sr_ / s, 3, 0.25, 0.2)
    L += 0.48 * sl; R += 0.48 * sr_; send += 0.35 * (sl + sr_)
    x = norm(C.render_synth_lead(synth, glide_ms=10, cutoff=4500)); L += 0.30 * x; R += 0.30 * x; send += 0.4 * x
    x = norm(C.delay(norm(C.render_lead_guitar(guitar, bright=True, drive=11)), 3, 0.3, 0.18))
    L += 0.42 * x; R += 0.46 * x; send += 0.4 * x

    rl, rr = C.stereo_reverb(send, 1.8)
    L += 0.22 * rl
    R += 0.22 * rr

    w = filter_open()
    L, R = C.swept(L, w, 500), C.swept(R, w, 500)

    kicks, snares, hats, perc = norm(kicks), norm(snares), norm(hats), norm(perc)
    L += 0.72 * kicks + 0.55 * snares + 0.45 * hats + 0.42 * perc
    R += 0.72 * kicks + 0.55 * snares + 0.55 * hats + 0.40 * perc
    return C.master(L, R, sheen=0.4)


if __name__ == "__main__":
    C.write_parts(sys.argv[1], "eurobeat", "Hole in One Rush", render())
