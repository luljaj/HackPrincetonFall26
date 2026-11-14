# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["mlx-whisper", "librosa", "soundfile"]
# ///
"""Check generated speech against captions with ASR and record voiced median pitch."""
import argparse,json,subprocess
from voice_text import word_error
from pathlib import Path
import numpy as np
import librosa
import mlx_whisper
from voice_runtime import ROOT


p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--audio',type=Path,default=ROOT/'apps/web/public/media/lab')
p.add_argument('--out',type=Path,default=ROOT/'voices/dora/evaluation/line-checks.json')
a=p.parse_args();lines=json.loads((ROOT/'apps/web/app/lab/lines.json').read_text());results=[]
for key,text in lines.items():
    path=a.audio/f'{key}.m4a'
    if not path.exists():continue
    result=mlx_whisper.transcribe(str(path),path_or_hf_repo='mlx-community/whisper-large-v3-turbo',language='en',condition_on_previous_text=False,temperature=0)
    heard=result['text'].strip()
    sr=24000
    wav=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(sr),'-ac','1','-f','f32le','-']),dtype='<f4')
    f0,voiced,_=librosa.pyin(wav,sr=sr,fmin=80,fmax=650,frame_length=1024,hop_length=256)
    pitch=float(np.nanmedian(f0[voiced])) if np.any(voiced) else None
    error=word_error(text,heard)
    row={'id':key,'expected':text,'transcribed':heard,'word_error_rate':error,'median_pitch_hz':pitch,'duration':len(wav)/sr}
    results.append(row);print(json.dumps(row),flush=True)
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(results,indent=2))
print('CHECKED',len(results),'lines',flush=True)
