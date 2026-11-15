"""Cut Dora's talking loops for the pauses where she is the one on screen talking: python3 tools/cut-loops.py

While Dora waits or listens, the player holds the exact paused frame (with a slow push-in), so nothing in the
background ever moves. While she talks, it plays a short loop of her own mouth from the last ~1.2 s before
the pause, built backwards-then-forwards from the paused frame. It starts and ends on that very frame, so
showing or hiding it is invisible, and it's too short for anything else in the shot to wander.

Old approach, and why it's gone: whole-frame boomerangs of the show's waiting moment. Moving background
characters walked forwards then backwards, the talk and wait clips came from different seconds (things jumped
when Dora started or stopped talking), and some waits contained the show revealing the answer.

Only hand-checked spots get a loop (REVIEWED): which character is talking can't be detected automatically, and
another character's mouth moving to Dora's voice is worse than a still frame. Everything else holds its frame.
Writes public/media/loops/<spot>-talk.mp4 and app/lab/loops.json. Needs only ffmpeg.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'
SRC = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUT = ROOT / 'apps/web/public/media/loops'
TALK_S = 1.2  # how far back the mouth loop reaches: long enough to read as talking, short enough not to drift
MIN_TALK_S = 0.6
FRAME_S = 1 / 29.97

# Checked frame by frame (the strips in the demo review): Dora is the one talking in the last TALK_S, in the
# same shot, with little else moving. Add a spot only after looking at it.
REVIEWED = {
    'ep3-07': 'Dora asks who helps when we are lost; Boots only blinks',
    'ep3-26': 'Dora close-up, "Where do we go next?"',
    'ep3-55': 'Dora close-up holding the keys, "Count with me"',
    'ep3-60': 'Dora, "Say it with us"',
}
# Looked at and rejected: ep3-27 (wide shot, the bird painting moves a lot), ep3-39 (no characters, a shape
# piece animates), ep3-57 (Mommy is the one talking).


def scene_cuts():
    cache = OUT / 'cuts.json'
    if cache.exists(): return json.loads(cache.read_text())
    log = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(SRC), '-vf', "scale=160:-1,select='gt(scene,0.3)',metadata=print:file=-",
                          '-an', '-f', 'null', '-'], capture_output=True, text=True, check=True).stdout
    cuts = [float(t) for t in re.findall(r'pts_time:([\d.]+)', log)]
    cache.write_text(json.dumps(cuts))
    return cuts


def talk_window(sp, cuts):
    """The last TALK_S before the pause, inside its camera shot and the prompt; None if too short."""
    shot_start = max([c for c in cuts if c <= sp['pauseAt']] or [0])
    start = max(sp['pauseAt'] - TALK_S, shot_start + 0.05, sp['talk'][0])
    return (start, sp['pauseAt']) if sp['pauseAt'] - start >= MIN_TALK_S else None


def anchored_loop(start, end, dest):
    """Backwards from the paused frame, then forwards back to it: first and last frames are the paused frame."""
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-t', f'{end - start + FRAME_S:.3f}', '-i', str(SRC),
                    '-filter_complex', '[0:v]split[a][b];[a]reverse[r];[r][b]concat=n=2:v=1[o]', '-map', '[o]', '-an',
                    '-c:v', 'libx264', '-crf', '18', '-g', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest)], check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cuts = scene_cuts()
    for old in OUT.glob('*.mp4'): old.unlink()  # every clip is rebuilt; nothing stale is left
    spots = {sp['id']: sp for sp in json.loads((LAB / 'spots.json').read_text())}
    manifest = {}
    for sid in REVIEWED:
        window = talk_window(spots[sid], cuts)
        if not window: print(sid, 'skipped: no clean talking window'); continue
        anchored_loop(*window, OUT / f'{sid}-talk.mp4')
        manifest[sid] = {'talk': True}
        print(sid, 'talk loop %.2fs' % (2 * (window[1] - window[0])), flush=True)
    (LAB / 'loops.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'{len(manifest)} spots have a talking loop; every other spot holds its paused frame')


if __name__ == '__main__':
    # self-checks: the window stays inside the shot and the prompt, and is skipped when too short
    assert talk_window({'pauseAt': 10.0, 'talk': [5.0, 10.0]}, [2.0]) == (8.8, 10.0)
    assert talk_window({'pauseAt': 10.0, 'talk': [5.0, 10.0]}, [9.5]) is None  # cut 0.5 s before the pause
    assert talk_window({'pauseAt': 10.0, 'talk': [9.2, 10.0]}, [2.0]) == (9.2, 10.0)
    main()
