"""Cut a seamless talk/wait loop clip per spot: python3 tools/cut-loops.py [--only ep3-20 ...]

Each loop is a boomerang (forward then reversed) of a stretch with no camera cut, so `<video loop>`
never jumps. The wait loop starts and ends on the pause frame, so crossfading in from the frozen
episode is invisible. Needs only ffmpeg.
"""
import argparse, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'
SRC = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUT = ROOT / 'apps/web/public/media/loops'
WAIT_S, MIN_S, PAD = 1.2, 0.4, 0.05


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


def windows(sp, cuts):
    a, b = shot(sp['pauseAt'], cuts)
    if b - sp['pauseAt'] >= MIN_S: wait = (sp['pauseAt'], min(sp['pauseAt'] + WAIT_S, b), False)  # forward from the pause
    else: wait = (max(sp['pauseAt'] - WAIT_S, a), sp['pauseAt'], True)  # cut right after: rewind into it instead
    t0, t1 = sp['talk']
    s0, s1 = shot(min(t1, sp['pauseAt']) - 0.01, cuts)  # talk stays in the shot nearest the pause
    talk = (max(t0, s0), min(t1, s1), False)
    if talk[1] - talk[0] < MIN_S: talk = wait
    return {'wait': wait, 'talk': talk}


def boomerang(start, end, reverse_first, dest):
    order = '[r][a]' if reverse_first else '[a][r]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-t', f'{end - start:.3f}', '-i', str(SRC),
                    '-filter_complex', f'[0:v]split[a][b];[b]reverse[r];{order}concat=n=2:v=1[o]', '-map', '[o]', '-an',
                    '-c:v', 'libx264', '-crf', '22', '-g', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest)], check=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--only', nargs='*')
    args = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    cuts = scene_cuts()
    for sp in json.loads((LAB / 'spots.json').read_text()):
        if args.only and sp['id'] not in args.only: continue
        for name, (a, b, rev) in windows(sp, cuts).items():
            assert b - a > 0.1, (sp['id'], name, a, b)
            boomerang(a, b, rev, OUT / f"{sp['id']}-{name}.mp4")
        print(sp['id'], flush=True)


if __name__ == '__main__':
    # self-check: a cut 0.2s after the pause makes the wait loop rewind into the shot instead
    w = windows({'pauseAt': 10.0, 'talk': [8.0, 10.0]}, [5.0, 10.2])
    assert w['wait'] == (8.8, 10.0, True) and w['talk'] == (8.0, 10.0, False), w
    main()
