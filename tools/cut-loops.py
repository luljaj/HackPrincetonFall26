"""Cut in-scene talk/wait loops for the spots that have a calm waiting moment: python3 tools/cut-loops.py

Dora never leaves the scene she is in. Where the show itself waits for the viewer after a prompt (same camera
shot, little movement), that waiting moment becomes the wait loop and the prompt just before it the talk loop,
both as boomerangs (forward then reversed) so `<video loop>` never jumps. Everywhere else the player simply
holds the paused frame. Writes the clips to public/media/loops/ and a manifest to app/lab/loops.json.
Needs only ffmpeg.
"""
import json, re, statistics, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'
SRC = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUT = ROOT / 'apps/web/public/media/loops'
MIN_WAIT_S, MAX_WAIT_S, MIN_TALK_S, PAD = 0.8, 4.0, 0.4, 0.05
CALM = 0.7  # mean frame difference; the show's quiet waits measure 0.06-0.6, busy shots 0.9-5.6


def scene_cuts():
    cache = OUT / 'cuts.json'
    if cache.exists(): return json.loads(cache.read_text())
    log = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(SRC), '-vf', "scale=160:-1,select='gt(scene,0.3)',metadata=print:file=-",
                          '-an', '-f', 'null', '-'], capture_output=True, text=True, check=True).stdout
    cuts = [float(t) for t in re.findall(r'pts_time:([\d.]+)', log)]
    cache.write_text(json.dumps(cuts))
    return cuts


def shot(t, cuts):
    """(start, end) of the camera shot containing t."""
    return max([c for c in cuts if c <= t] or [0]) + PAD, min([c for c in cuts if c > t] or [1e9]) - PAD


def wait_window(sp, cuts):
    """The show's own wait after the prompt, kept inside the shot; None if it's too short."""
    start = sp['pauseAt'] + 0.1
    end = min(sp['pauseAt'] + sp['gap'] - 0.1, shot(sp['pauseAt'], cuts)[1], sp['pauseAt'] + MAX_WAIT_S)
    return (start, end) if end - start >= MIN_WAIT_S else None


def talk_window(sp, cuts):
    """The prompt just before the pause, kept inside the same shot as the wait; None if too short."""
    s0, _ = shot(sp['pauseAt'], cuts)
    start, end = max(sp['talk'][0], s0), min(sp['talk'][1], sp['pauseAt'])
    return (start, end) if end - start >= MIN_TALK_S else None


def motion(start, end):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{start:.2f}', '-t', f'{end - start:.2f}', '-i', str(SRC), '-vf',
                          'scale=160:-1,tblend=all_mode=difference,signalstats,metadata=print:file=-', '-an', '-f', 'null', '-'],
                         capture_output=True, text=True).stdout
    values = [float(v) for v in re.findall(r'YAVG=([\d.]+)', out)]
    return statistics.mean(values) if values else 99.0


def boomerang(start, end, dest):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-t', f'{end - start:.3f}', '-i', str(SRC),
                    '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[o]', '-map', '[o]', '-an',
                    '-c:v', 'libx264', '-crf', '22', '-g', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest)], check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cuts = scene_cuts()
    for old in OUT.glob('*.mp4'): old.unlink()  # every clip is rebuilt; nothing stale (or from another scene) is left
    manifest = {}
    for sp in json.loads((LAB / 'spots.json').read_text()):
        wait = wait_window(sp, cuts)
        if not wait or motion(*wait) > CALM: continue  # busy or no pause: the player holds the frame instead
        boomerang(*wait, OUT / f"{sp['id']}-wait.mp4")
        talk = talk_window(sp, cuts)
        if talk: boomerang(*talk, OUT / f"{sp['id']}-talk.mp4")
        manifest[sp['id']] = {'talk': bool(talk)}
        print(sp['id'], 'wait %.1fs' % (wait[1] - wait[0]), 'talk' if talk else 'no talk', flush=True)
    (LAB / 'loops.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'{len(manifest)} spots loop in their own scene; the rest hold the paused frame')


if __name__ == '__main__':
    # self-check: a camera cut 0.5 s after the pause leaves too short a wait, so that spot holds the frame
    assert wait_window({'pauseAt': 10.0, 'gap': 3.0}, [5.0, 10.5]) is None
    assert wait_window({'pauseAt': 10.0, 'gap': 3.0}, [5.0, 20.0]) == (10.1, 12.9)
    assert talk_window({'pauseAt': 10.0, 'talk': [8.0, 10.0]}, [9.0, 20.0]) == (9.05, 10.0)
    main()
