# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["mlx-whisper"]
# ///
"""Re-transcribe separated vocals and split by episode, keeping episode 4 unseen."""
import argparse,json,re
from pathlib import Path
import mlx_whisper

ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--dataset',type=Path,default=ROOT/'voices/dora/dataset')
a=p.parse_args();data=json.loads((a.dataset/'selected.json').read_text())
accepted=[];rejected=[]
for i,row in enumerate(data):
    result=mlx_whisper.transcribe(str(a.dataset/row['audio']),path_or_hf_repo='mlx-community/whisper-large-v3-turbo',language='en',condition_on_previous_text=False,temperature=0)
    text=result['text'].strip()
    segments=result.get('segments',[])
    if len(text.split())<3 or not segments or max(s.get('no_speech_prob',0) for s in segments)>.7 or min(s.get('avg_logprob',0) for s in segments)<-1:
        row['rejection']='uncertain ASR';rejected.append(row);continue
    row['original_text']=row['text'];row['text']=text
    accepted.append(row)
    print(f'{i+1}/{len(data)} {row["id"]}: {text}',flush=True)
for name,rows in [('train',[r for r in accepted if r['episode']!=4]),('valid',[r for r in accepted if r['episode']==4]),('rejected',rejected)]:
    (a.dataset/f'{name}.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
    print(name,len(rows),flush=True)
