# Synthetic fixtures

The files in `fixtures/synthetic/` are original diagrams, a short generated picture sequence, a tone, and a short note. They were produced by `scripts/generate_fixtures.py` with Pillow and ffmpeg on this project. No file was downloaded, and none of the media is a photograph, a recording of a person, or a copy of published material.

## Usage rights

The project may use these files for local tests, ingestion checks, and demonstrations. They are not a record of a real exercise. Do not present them as operational evidence.

## What each file is

| File | What it is |
| --- | --- |
| `tracked-ground.jpg`, `.png`, `.webp` | A drawn rectangle on a brown band, plus a green ellipse. Not a vehicle and not a drone. |
| `training-block.mp4` | Two seconds of a flat colour frame with a 440 Hz tone. |
| `training-block.mov` | Two seconds of a flat colour frame and no audio. |
| `tone.wav`, `tone.mp3`, `tone.m4a` | A one-second 440 Hz tone. espeak is not required. This is not speech. |
| `inspection-note.txt` | An original sentence about a checklist. It is source text, not a transcript. |

Regenerate with:

```bash
python scripts/generate_fixtures.py
```

Run it from `defence-media-explorer`. A tone must not be described as evidence that speech recognition works.
