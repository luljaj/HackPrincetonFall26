"""Render the prepared treasure-story edit; needs ffmpeg and the local original episode."""
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / 'apps/web/app/lab/demo-edit.json'
SOURCE = ROOT / 'apps/web/public/media/dora-ep3.mp4'
OUTPUT = ROOT / 'apps/web/public/media/demo/dora-treasure-preview.mp4'


def main():
    edit = json.loads(PLAN.read_text())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dora-story-') as directory:
        folder = Path(directory)
        parts = []
        for index, clip in enumerate(edit['clips']):
            length = clip['out'] - clip['in']
            if length <= 0:
                raise ValueError('Every story clip must have positive duration.')
            part = folder / f'{index}.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(clip['in']), '-t', str(length), '-i', str(SOURCE),
                '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
                '-af', f'afade=t=in:d=0.008,afade=t=out:st={length-0.008}:d=0.008', '-c:a', 'aac', '-b:a', '160k', str(part)], check=True)
            parts.append(f"file '{part}'")
        listing = folder / 'parts.txt'
        listing.write_text('\n'.join(parts))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
            '-c', 'copy', '-movflags', '+faststart', str(OUTPUT)], check=True)
    print(OUTPUT)


if __name__ == '__main__':
    main()
