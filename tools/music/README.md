# The game's music

Three tracks, all synthesised in Python (no samples). During a match the
game plays a random one, then another random one that isn't the same,
crossfading between them.

| Track | File | Style |
|---|---|---|
| Hole in Fun | `disco.py` | Electric disco, 128 BPM, two lead guitars dancing with each other |
| Neon Fairway | `synthwave.py` | 80s synthwave, 112 BPM, arpeggiator, gated drums, guitar solo |
| Hole in One Rush | `eurobeat.py` | Eurobeat, 156 BPM, supersaw riff, brass stabs, shred solo |

`common.py` has what the synthwave and Eurobeat tracks share: the beat
grid, notes and chords, filters, synth voices and drum sounds. `disco.py`
came first and has its own copies.

## Building

From the project folder, with Python (numpy, scipy) and ffmpeg installed:

    python3 tools/music/build.py

This renders all three, encodes each as MP3 parts in `public/assets/audio/`
and writes `music.json`, the list the game reads.

## How the game plays them

Each track is split into 4 parts of 35 to 45 seconds, so the game only
keeps a part or two in memory. Every part's file has half a second of its
neighbours as padding, so parts join without a gap. Each track starts and
ends quietly (a filter opening up, the band thinning out), and the game
crossfades from one track into the next over 4 seconds.

To add a track: write a script like the others that ends with
`common.write_parts(folder, name, title, mix)`, and add its name to
`TRACKS` in `build.py`.
