# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["chatterbox-mlx==1.3.1", "soundfile", "scipy"]
# ///
"""Render controlled voice-quality comparisons without replacing the active profile."""
import gc,json,time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
import mlx.core as mx
from scipy.signal import butter,sosfilt
from voice_runtime import ROOT,PROFILE,load_voice

out=ROOT/'voices/dora/evaluation/quality'
reference=out/'reference-hq.wav'
texts={'match':"I can't wait to tell my friend Boots the monkey.",'new':'A seatbelt keeps us safe! Great job!'}
cases=[('before','turbo',ROOT/'voices/dora/reference-training.wav',1.0),('hq-full','turbo',reference,1.0),('hq-light','turbo',reference,.35),('hq-base','turbo',reference,0.0),('original-hq','original',reference,0.0)]
rows=[]
for name,engine,ref,strength in cases:
    print('Loading',name,flush=True)
    model,_=load_voice(engine=engine,reference_override=ref,adapter_strength=strength,exaggeration=.3)
    for key,text in texts.items():
        torch.manual_seed(42);mx.random.seed(42)
        started=time.perf_counter()
        options={'exaggeration':.3,'cfg_weight':.6,'temperature':.7} if engine=='original' else {'seed':42,'temperature':.7}
        audio=model.generate(text,**options)
        if hasattr(audio,'numpy'):audio=audio.numpy()
        audio=np.asarray(audio).reshape(-1)
        path=out/f'{name}-{key}.wav';sf.write(path,audio,model.sr,subtype='PCM_24')
        sos=np.concatenate([butter(2,65,fs=model.sr,btype='highpass',output='sos'),butter(4,7800,fs=model.sr,btype='lowpass',output='sos')])
        smooth=sosfilt(sos,audio)
        sf.write(out/f'{name}-{key}-polished.wav',smooth,model.sr,subtype='PCM_24')
        rows.append({'case':name,'engine':engine,'strength':strength,'text':text,'file':str(path.relative_to(out)),'generation_seconds':time.perf_counter()-started,'duration':len(audio)/model.sr})
        print(name,key,round(rows[-1]['generation_seconds'],2),'seconds',flush=True)
    del model;gc.collect();mx.clear_cache()
(out/'comparisons.json').write_text(json.dumps(rows,indent=2))
