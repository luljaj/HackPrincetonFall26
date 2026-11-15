# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["demucs", "numpy", "soundfile", "torch<2.9", "torchaudio<2.9"]
# ///
"""Cut a no-voice "bed" (music + effects only) for every dubbed line: uv run tools/cut-dub-beds.py

When a dub plays, turning the whole show down mutes the music too. Instead the player crossfades to the
show's own audio with the voice removed, in sync, and the new line sits on top. This packs the dubbed
windows into one file, separates it once with Demucs, and writes one clip per line to
public/media/dubs/, recording each clip's window as `bed: [start, end]` in app/lab/dubs.json.
"""
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
DUBS = ROOT / 'apps/web/app/lab/dubs.json'
SRC = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUT = ROOT / 'apps/web/public/media/dubs'
LEAD_S, TAIL_S, SR = 0.6, 2.0, 44100  # start a little early for the crossfade; run past the line for a longer dub


def main():
    dubs = json.loads(DUBS.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('bed-*.m4a'): old.unlink()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(SRC), '-vn', '-ac', '2', '-ar', str(SR), str(tmp / 'episode.wav')], check=True)
        audio, _ = sf.read(tmp / 'episode.wav', dtype='float32')
        windows = [(max(0.0, d['start'] - LEAD_S), min(len(audio) / SR, d['end'] + TAIL_S)) for d in dubs]
        gap = np.zeros((SR // 2, 2), np.float32)  # half a second of quiet between windows so they don't bleed
        parts, offsets, at = [], [], 0
        for a, b in windows:
            clip = audio[int(a * SR): int(b * SR)]
            offsets.append((at, at + len(clip)))
            parts += [clip, gap]
            at += len(clip) + len(gap)
        sf.write(tmp / 'packed.wav', np.concatenate(parts), SR)
        subprocess.run(['python', '-m', 'demucs', '-n', 'htdemucs', '--two-stems', 'vocals', '-o', str(tmp / 'separated'), str(tmp / 'packed.wav')], check=True)
        bed, _ = sf.read(tmp / 'separated/htdemucs/packed/no_vocals.wav', dtype='float32')
        for d, (a, b), (i, j) in zip(dubs, windows, offsets):
            sf.write(tmp / 'bed.wav', bed[i:j], SR)
            name = f"bed-{d['start']:.2f}.m4a"
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp / 'bed.wav'), '-c:a', 'aac', '-b:a', '128k', str(OUT / name)], check=True)
            d['bed'] = [round(a, 3), round(b, 3)]
            print(name, f'{b - a:.1f}s', flush=True)
    DUBS.write_text(json.dumps(dubs, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
