# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["chatterbox-mlx==1.3.1", "mlx-whisper", "scipy"]
# ///
"""Generate the lab's lines using the local multilingual voice profile.

uv run tools/gen-voice-lines.py
uv run tools/gen-voice-lines.py --engine turbo --ref voice.wav
"""
import argparse,json,subprocess,tempfile,time
from pathlib import Path
from voice_runtime import ROOT,PROFILE,load_voice,generation_options
from voice_text import word_error
from voice_audio import polish_audio


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--profile',type=Path,default=PROFILE)
    p.add_argument('--ref',type=Path,help='Override the profile reference recording')
    p.add_argument('--verify',action='store_true',help='Try several seeds and select the clearest ASR-checked speech')
    p.add_argument('--base',action='store_true',help='Use the base model without the trained adapter')
    p.add_argument('--adapter-strength',type=float,help='Override the profile adapter strength (0–1)')
    p.add_argument('--engine',choices=['original','turbo','nano','multilingual'],default='multilingual')
    p.add_argument('--exaggeration',type=float,default=.7)
    p.add_argument('--only',nargs='*')
    p.add_argument('--pitch-hz',type=float)
    p.add_argument('--out',type=Path,default=ROOT/'apps/web/public/media/lab')
    args=p.parse_args()
    lines=json.loads((ROOT/'apps/web/app/lab/lines.json').read_text())
    if args.only and set(args.only)-lines.keys():p.error('Unknown line id')
    if args.pitch_hz is not None and not 80<=args.pitch_hz<=600:p.error('Pitch must be 80–600 Hz')
    import numpy as np
    import soundfile as sf
    model,profile=load_voice(args.profile,args.engine,args.exaggeration,use_adapter=not args.base,reference_override=args.ref,adapter_strength=args.adapter_strength)
    args.out.mkdir(parents=True,exist_ok=True)
    timings=[]
    for key,text in lines.items():
        if args.only and key not in args.only:continue
        start=time.perf_counter()
        kwargs=generation_options(profile,args.engine)
        if args.engine=='original':kwargs['exaggeration']=args.exaggeration
        wav=model.generate(text,**kwargs)
        if hasattr(wav,'numpy'):wav=wav.numpy()
        wav=polish_audio(np.asarray(wav).reshape(-1),model.sr,profile)
        checked=None
        if args.verify:
            import mlx_whisper
            best=None
            for attempt in range(4):
                if attempt and args.engine!='original':
                    wav=polish_audio(np.asarray(model.generate(text,**{**kwargs,'seed':attempt-1})).reshape(-1),model.sr,profile)
                with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
                    sf.write(tmp.name,wav,model.sr)
                    heard=mlx_whisper.transcribe(tmp.name,path_or_hf_repo='mlx-community/whisper-large-v3-turbo',language='en',condition_on_previous_text=False,temperature=0)['text'].strip()
                error=word_error(text,heard)
                if best is None or error<best[0]:best=(error,wav,heard)
                if error==0:break
            error,wav,heard=best
            checked={'word_error_rate':error,'transcribed':heard}
            if error>.15:raise ValueError(f'{key}: speech verification failed ({error:.0%}): {heard}')

        if not len(wav) or not np.isfinite(wav).all():raise ValueError(f'Invalid generated audio: {key}')
        if args.pitch_hz:
            import librosa
            f0,voiced,_=librosa.pyin(wav,fmin=80,fmax=600,sr=model.sr)
            pitch=np.nanmedian(f0[voiced])
            if not np.isfinite(pitch):raise ValueError(f'No measurable pitch: {key}')
            wav=librosa.effects.pitch_shift(wav,sr=model.sr,n_steps=12*np.log2(args.pitch_hz/pitch))
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'speech.wav';encoded=Path(temp)/'speech.m4a'
            sf.write(source,wav,model.sr,subtype='PCM_24')
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-c:a','aac','-b:a','160k',str(encoded)],check=True)
            (args.out/f'{key}.m4a').write_bytes(encoded.read_bytes())
        elapsed=time.perf_counter()-start
        timings.append({'id':key,'text':text,'duration':len(wav)/model.sr,'generation_seconds':elapsed,'verification':checked})
        print(f'{key}: {len(wav)/model.sr:.1f}s audio generated in {elapsed:.1f}s',flush=True)
    (args.out/'voice-generation.json').write_text(json.dumps({'engine':args.engine,'profile':str(args.profile),'lines':timings},indent=2))

if __name__=='__main__':main()
