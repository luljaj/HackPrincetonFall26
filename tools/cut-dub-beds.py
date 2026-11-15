# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["demucs", "numpy", "soundfile", "torch<2.9", "torchaudio<2.9"]
# ///
"""Cut a no-voice "bed" (music + effects only) for every dubbed line: uv run tools/cut-dub-beds.py <transcript.json>

When a dub plays, turning the whole show down mutes the music too. Instead the player crossfades to the
show's own audio with the voice removed, in sync, and the new line sits on top. This packs the dubbed
windows into one file, separates it once with Demucs, and writes one clip per line to
public/media/dubs/, recording each clip's window as `bed: [start, end]` in app/lab/dubs.json.
Dora lines less than GROUP_GAP_S apart with nobody else speaking between them share one bed, so the show
never fades back to the original voice in the middle of a run ("…we say, Arriba." / "Can you say Arriba?").
"""
import sys
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
DUBS = ROOT / 'apps/web/app/lab/dubs.json'
SRC = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUT = ROOT / 'apps/web/public/media/dubs'
LEAD_S, TAIL_S, SR = 0.6, 2.0, 44100  # start a little early for the crossfade; run past the line for a longer dub
GROUP_GAP_S = 2.5


def groups(dubs, segments):
    """Runs of dubbed lines close together with no other speech between them, as lists of indexes."""
    out = [[0]] if dubs else []
    for i in range(1, len(dubs)):
        a, b = dubs[i - 1], dubs[i]
        between = [s for s in segments if a['end'] - 0.05 < s['start'] < b['start'] - 0.05]
        if b['start'] - a['end'] < GROUP_GAP_S and not between: out[-1].append(i)
        else: out.append([i])
    return out


def main():
    dubs = json.loads(DUBS.read_text())
    segments = json.loads(Path(sys.argv[1]).read_text())['segments'] if len(sys.argv) > 1 else []
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('bed-*.m4a'): old.unlink()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(SRC), '-vn', '-ac', '2', '-ar', str(SR), str(tmp / 'episode.wav')], check=True)
        audio, _ = sf.read(tmp / 'episode.wav', dtype='float32')
        runs = groups(dubs, segments)
        windows = [(max(0.0, dubs[g[0]]['start'] - LEAD_S), min(len(audio) / SR, dubs[g[-1]]['end'] + TAIL_S)) for g in runs]
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
        for g, (a, b), (i, j) in zip(runs, windows, offsets):
            sf.write(tmp / 'bed.wav', bed[i:j], SR)
            name = f"bed-{a:.2f}.m4a"  # named by the bed's own start: every line in the run shares it
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp / 'bed.wav'), '-c:a', 'aac', '-b:a', '128k', str(OUT / name)], check=True)
            for k in g: dubs[k]['bed'] = [round(a, 3), round(b, 3)]
            print(name, f'{b - a:.1f}s', f'{len(g)} line(s)', flush=True)
    DUBS.write_text(json.dumps(dubs, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    # self-check: two close lines group; a third speaker in between, or a long gap, splits them
    L = lambda s, e: {'start': s, 'end': e}
    assert groups([L(0, 2), L(2.3, 4), L(10, 11)], []) == [[0, 1], [2]]
    assert groups([L(0, 2), L(2.3, 4)], [{'start': 2.1}]) == [[0], [1]]
    main()
