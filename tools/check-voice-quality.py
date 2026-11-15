# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["mlx-whisper", "librosa", "soundfile", "resemblyzer", "setuptools<81"]
# ///
"""Compare speech identity proxies and transcript accuracy; does not grade human naturalness."""
import argparse,json
from pathlib import Path
import librosa,numpy as np,soundfile as sf,torch
import mlx_whisper
from resemblyzer import VoiceEncoder,preprocess_wav
from voice_runtime import ROOT
from voice_audio import polish_audio
from voice_text import word_error

p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cases',nargs='*');args=p.parse_args()
torch.set_num_threads(4)
out=ROOT/'voices/dora/evaluation/quality'
encoder=VoiceEncoder(device='cpu')
ref,sr=sf.read(out/'reference-hq.wav',dtype='float32')
reference=encoder.embed_utterance(preprocess_wav(ref,source_sr=sr))
previous=json.loads((out/'quality-checks.json').read_text()) if (out/'quality-checks.json').exists() else []
rows=[r for r in previous if args.cases and r['case'] not in args.cases]
for item in json.loads((out/'comparisons.json').read_text()):
    if args.cases and item['case'] not in args.cases:continue
    for suffix in ['', '-polished']:
        path=out/(Path(item['file']).stem+suffix+'.wav')
        if not path.exists():
            original,rate=sf.read(out/item['file'],dtype='float32')
            sf.write(path,polish_audio(original,rate,{'postprocess':{'highpass_hz':65,'lowpass_hz':7800,'gain_db':0}}),rate,subtype='PCM_24')
        wav,sr=sf.read(path,dtype='float32')
        emb=encoder.embed_utterance(preprocess_wav(wav,source_sr=sr))
        result=mlx_whisper.transcribe(str(path),path_or_hf_repo='mlx-community/whisper-large-v3-turbo',language='en',condition_on_previous_text=False,temperature=0)
        f0,voiced,_=librosa.pyin(wav,sr=sr,fmin=80,fmax=650,frame_length=1024,hop_length=256)
        pitch=float(np.nanmedian(f0[voiced])) if np.any(voiced) else None
        spectrum=np.abs(librosa.stft(wav,n_fft=1024))**2
        freqs=librosa.fft_frequencies(sr=sr,n_fft=1024)
        high=float(spectrum[freqs>6500].sum()/spectrum.sum())
        row={'case':item['case'],'text':item['text'],'polished':bool(suffix),'file':path.name,'voice_similarity':float(emb@reference),'word_error_rate':word_error(item['text'],result['text']),'heard':result['text'].strip(),'median_pitch_hz':pitch,'high_band_energy_ratio':high}
        rows.append(row);print(json.dumps(row),flush=True)
(out/'quality-checks.json').write_text(json.dumps(rows,indent=2))
