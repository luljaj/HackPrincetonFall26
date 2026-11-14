# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["demucs", "numpy", "soundfile", "torch<2.9", "torchaudio<2.9"]
# ///
"""Select strong Dora matches, separate music, and create a reproducible training dataset."""
import argparse, csv, glob, json, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--index', type=Path, default=Path.home()/'Downloads/dora samples/sample-index.csv')
p.add_argument('--source', type=Path)
p.add_argument('--out', type=Path, default=ROOT/'voices/dora/dataset')
a = p.parse_args()
source=a.source or Path(glob.glob('/tmp/claude-501/**/scratchpad/dora/ep1.json',recursive=True)[0]).parent
out=a.out;out.mkdir(parents=True,exist_ok=True)
rows=list(csv.DictReader(a.index.open()))
selected=[r for r in rows if float(r['voice_similarity'])>=0.8 and float(r['margin_over_Boots'])>=0.05 and 2<=float(r['end_seconds'])-float(r['start_seconds'])<=12 and len(r['transcript'].split())>=4]
if len(selected)<20:raise ValueError('Too few strong speech samples.')
parts=[];manifest=[];cursor=0
for ep in range(1,5):
    audio,sr=sf.read(source/f'ep{ep}.wav',dtype='float32')
    if sr!=16000:raise ValueError('Expected source audio at 16 kHz.')
    if audio.ndim>1:audio=audio.mean(axis=1)
    for row in [r for r in selected if int(r['episode'])==ep]:
        start=max(0,int((float(row['start_seconds'])-.06)*sr));end=min(len(audio),int((float(row['end_seconds'])+.08)*sr))
        clip=audio[start:end];silence=np.zeros(int(.3*sr),np.float32)
        key=f'ep{ep}-{int(float(row["start_seconds"])*100):06d}'
        manifest.append({'id':key,'episode':ep,'source_start':start/sr,'source_end':end/sr,'packed_start':cursor/sr,'duration':len(clip)/sr,'text':row['transcript'],'speaker_similarity':float(row['voice_similarity']),'speaker_status':'automatic high-confidence match; not manually auditioned'})
        parts.extend([clip,silence]);cursor+=len(clip)+len(silence)
sf.write(out/'packed.wav',np.concatenate(parts),16000)
subprocess.run(['python','-m','demucs','-n','htdemucs','--two-stems','vocals','--device','cpu','-o',str(out/'separated'),str(out/'packed.wav')],check=True)
vocals,sr=sf.read(out/'separated/htdemucs/packed/vocals.wav',dtype='float32')
if vocals.ndim>1:vocals=vocals.mean(axis=1)
(out/'wavs').mkdir(exist_ok=True)
for row in manifest:
    start=int(row['packed_start']*sr);end=start+int(row['duration']*sr)
    dest=out/'wavs'/f'{row["id"]}.wav'
    sf.write(dest,vocals[start:end],sr)
    row['audio']=str(dest.relative_to(out))
(out/'selected.json').write_text(json.dumps(manifest,indent=2))
print(f'Prepared {len(manifest)} clips, {sum(x["duration"] for x in manifest)/60:.1f} minutes in {out}',flush=True)
