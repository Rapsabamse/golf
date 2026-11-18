"""
Render every track, encode the parts as MP3 and write the game's music.json.

    python3 tools/music/build.py

Needs Python with numpy and scipy, and ffmpeg. Takes a minute or two.
Writes into public/assets/audio/ (run it from the project folder).
"""

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join("public", "assets", "audio")

# In the order the game lists them; it picks among them at random
TRACKS = ["disco", "synthwave", "eurobeat"]


def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []

    with tempfile.TemporaryDirectory() as work:
        for name in TRACKS:
            print(f"Rendering {name}...")
            subprocess.run([sys.executable, os.path.join(HERE, f"{name}.py"), work], check=True)

            with open(os.path.join(work, f"{name}.json")) as f:
                entry = json.load(f)

            for part in entry["parts"]:
                wav = os.path.join(work, part["file"].replace(".mp3", ".wav"))
                subprocess.run(
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav,
                     "-codec:a", "libmp3lame", "-b:a", "160k", os.path.join(OUT, part["file"])],
                    check=True,
                )
            entries.append(entry)

    with open(os.path.join(OUT, "music.json"), "w") as f:
        json.dump({"tracks": entries}, f, indent=2)
    print(f"Wrote {len(entries)} tracks to {OUT}")


if __name__ == "__main__":
    main()
