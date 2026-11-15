"""Continuous speech filtering, shared by saved audio and streamed chunks."""
import numpy as np
from scipy.signal import butter,sosfilt
import subprocess
from itertools import chain

class VoicePostProcessor:
    def __init__(self,sample_rate,highpass_hz=65,lowpass_hz=7800,gain_db=0):
        if not 0<highpass_hz<lowpass_hz<sample_rate/2:
            raise ValueError('Filter frequencies must be inside the audio bandwidth.')
        if not np.isfinite(gain_db) or not -12<=gain_db<=12:
            raise ValueError('Gain must be between -12 and 12 dB.')
        self.sos=np.concatenate([butter(2,highpass_hz,fs=sample_rate,btype='highpass',output='sos'),butter(4,lowpass_hz,fs=sample_rate,btype='lowpass',output='sos')])
        self.state=np.zeros((len(self.sos),2))
        self.gain=10**(gain_db/20)
        self.fade=max(1,int(sample_rate*.005))
        self.position=0
        self.tail=np.zeros(0,dtype=np.float32)
        self.closed=False

    def process(self,samples):
        if self.closed:raise ValueError('Audio processor is already finished.')
        samples=np.asarray(samples,dtype=np.float32).reshape(-1)
        if not np.isfinite(samples).all():raise ValueError('Non-finite speech audio.')
        if not len(samples):return samples
        audio,self.state=sosfilt(self.sos,samples,zi=self.state)
        audio*=self.gain
        # A soft knee protects peaks without raising quiet background noise.
        peaks=np.abs(audio);hot=peaks>.9
        audio[hot]=np.sign(audio[hot])*(.9+.1*np.tanh((peaks[hot]-.9)/.1))
        if self.position<self.fade:
            n=min(self.fade-self.position,len(audio))
            audio[:n]*=np.arange(self.position,self.position+n)/self.fade
        self.position+=len(audio)
        audio=np.concatenate([self.tail,audio.astype(np.float32)])
        self.tail=audio[-self.fade:]
        return audio[:-self.fade] if len(audio)>self.fade else np.zeros(0,dtype=np.float32)

    def finish(self):
        if self.closed:return np.zeros(0,dtype=np.float32)
        self.closed=True
        tail=self.tail.copy()
        if len(tail):tail*=np.linspace(1,0,len(tail),dtype=np.float32)
        return tail


def processor_for(profile,sample_rate):
    settings=profile.get('postprocess')
    return VoicePostProcessor(sample_rate,**settings) if settings else None


def polish_audio(samples,sample_rate,profile):
    processor=processor_for(profile,sample_rate)
    if processor is None:return np.asarray(samples).reshape(-1)
    return np.concatenate([processor.process(samples),processor.finish()])


def fit_dub(samples, sample_rate, duration):
    """Fit a prepared line with FFmpeg's pitch-preserving tempo filter."""
    audio = np.asarray(samples, dtype='<f4').reshape(-1)
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError('Invalid dub audio.')
    audible = np.flatnonzero(np.abs(audio) >= .02)
    if len(audible):
        pad = round(sample_rate * .04)
        audio = audio[max(0, audible[0] - pad):min(len(audio), audible[-1] + pad + 1)]
    rate = min(1.8, max(1, len(audio) / sample_rate / duration))
    result = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sample_rate),
        '-ac', '1', '-i', 'pipe:0', '-af', f'atempo={rate:.6f}',
        '-f', 'f32le', '-ar', str(sample_rate), '-ac', '1', 'pipe:1'],
        input=audio.tobytes(), capture_output=True, check=True)
    fitted = np.frombuffer(result.stdout, dtype='<f4').copy()
    fade = min(round(sample_rate * .005), len(fitted) // 2)
    if fade:
        fitted[:fade] *= np.linspace(0, 1, fade)
        fitted[-fade:] *= np.linspace(1, 0, fade)
    return fitted


def join_speech(parts, sample_rate):
    """Join language spans without carrying the model's padding between words."""
    result = np.zeros(0, dtype=np.float32)
    for samples in parts:
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        audible = np.flatnonzero(np.abs(audio) >= .005)
        if not len(audible):
            continue
        pad = round(sample_rate * .025)
        audio = audio[max(0, audible[0]-pad):min(len(audio), audible[-1]+pad+1)]
        overlap = min(round(sample_rate * .01), len(result), len(audio))
        if overlap:
            mix = np.linspace(0, 1, overlap, dtype=np.float32)
            result = np.concatenate([result[:-overlap], result[-overlap:]*(1-mix)+audio[:overlap]*mix, audio[overlap:]])
        else:
            result = audio.copy()
    return result


def stream_join_speech(parts, sample_rate):
    """Trim padding and crossfade language spans while their audio is still arriving."""
    pad = round(sample_rate * .025)
    overlap = max(1, round(sample_rate * .01))
    tail = np.zeros(0, dtype=np.float32)

    def trimmed(chunks):
        pending = np.zeros(0, dtype=np.float32)
        started = False
        for chunk in chunks:
            audio = np.concatenate([pending, np.asarray(chunk, dtype=np.float32).reshape(-1)])
            audible = np.flatnonzero(np.abs(audio) >= .005)
            if not started:
                if not len(audible):
                    pending = audio[-pad:]
                    continue
                audio = audio[max(0, audible[0] - pad):]
                started = True
                audible = np.flatnonzero(np.abs(audio) >= .005)
            if len(audible):
                end = audible[-1] + 1
                yield audio[:end]
                pending = audio[end:]
            else:
                pending = audio
        if started and len(pending):
            yield pending[:pad]

    for chunks in parts:
        chunks = trimmed(chunks)
        head = np.zeros(0, dtype=np.float32)
        for chunk in chunks:
            head = np.concatenate([head, chunk])
            if len(head) >= overlap:
                break
        if not len(head):
            continue
        n = min(overlap, len(tail), len(head))
        if n:
            mix = np.linspace(0, 1, n, dtype=np.float32)
            head = np.concatenate([tail[:-n], tail[-n:] * (1 - mix) + head[:n] * mix, head[n:]])
        else:
            head = np.concatenate([tail, head])
        tail = np.zeros(0, dtype=np.float32)
        for chunk in chain([head], chunks):
            audio = np.concatenate([tail, chunk])
            if len(audio) > overlap:
                yield audio[:-overlap]
            tail = audio[-overlap:]
    if len(tail):
        yield tail
