# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["mlx-whisper", "transformers", "torch", "numpy"]
# ///
"""Resident local listening server (pronunciation + transcription): uv run tools/pronounce-server.py

POST /score {word, language, ipa, audio: base64 of any ffmpeg-readable clip}
→ {verdict: good|close|retry|silent, heard, target, distance, targetLogprob, coach, ms}
POST /transcribe {audio, hint: expected answers, languages: ["en", "es"]}
→ {text, language, silent, ms}
Whisper large-v3-turbo scores how likely the clip is the target word (the verdict); wav2vec2-xlsr
espeak phonemes name the one sound to coach. Both are multilingual, so any language works.
"""
import argparse
import base64
import json
import logging
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from concurrent.futures import ThreadPoolExecutor

from pronounce_core import (FRAME, LEAD_PAD, SAMPLE_RATE, SILENT_PEAK, WINDOW_S, is_silent, parse_request,
                            parse_transcribe_request, score, speech_bounds)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--whisper', default='mlx-community/whisper-large-v3-turbo')
    parser.add_argument('--phonemes', default='facebook/wav2vec2-xlsr-53-espeak-cv-ft', help='HF id or local folder')
    args = parser.parse_args()

    import mlx.core as mx
    import numpy as np
    import torch
    from mlx_whisper.audio import log_mel_spectrogram, pad_or_trim
    from mlx_whisper.load_models import load_model
    from mlx_whisper.tokenizer import get_tokenizer
    from mlx_whisper.transcribe import ModelHolder, transcribe as mlx_transcribe
    from huggingface_hub import hf_hub_download
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC

    whisper = load_model(args.whisper, dtype=mx.float16)
    ModelHolder.model, ModelHolder.model_path = whisper, args.whisper  # mlx_whisper.transcribe reuses it, no second copy
    full_positions = whisper.encoder._positional_embedding
    phone_model = Wav2Vec2ForCTC.from_pretrained(args.phonemes).eval()
    features = Wav2Vec2FeatureExtractor.from_pretrained(args.phonemes)
    # Read vocab.json directly: the phoneme tokenizer class needs espeak installed just to load.
    vocab_path = Path(args.phonemes) / 'vocab.json' if Path(args.phonemes).is_dir() else hf_hub_download(args.phonemes, 'vocab.json')
    vocab = {i: t for t, i in json.loads(Path(vocab_path).read_text(encoding='utf-8')).items()}
    blank = phone_model.config.pad_token_id
    cpu = ThreadPoolExecutor(max_workers=1)  # the phoneme model's thread

    def decode(audio_b64: str):
        raw = base64.b64decode(audio_b64, validate=True)
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-t', '10', '-f', 'f32le', '-ac', '1', '-ar', str(SAMPLE_RATE), 'pipe:1'],
                             input=raw, capture_output=True, timeout=10)
        if pcm.returncode or not pcm.stdout: raise ValueError('Audio could not be decoded.')
        wav = np.frombuffer(pcm.stdout, dtype=np.float32)
        frames = wav[: len(wav) // FRAME * FRAME].reshape(-1, FRAME)
        start, end = speech_bounds(np.sqrt((frames ** 2).mean(axis=1)).tolist())
        wav = wav[start * FRAME: end * FRAME] if end > start else wav
        pad = np.zeros(LEAD_PAD, dtype=np.float32)
        return np.concatenate([pad, wav, pad])

    def encode(wav):
        frames = min(100 * max(WINDOW_S, int(np.ceil(len(wav) / SAMPLE_RATE)) + 1), 3000)
        # ponytail: shorter-than-30 s encoder window (positional embedding sliced); Whisper was trained on 30 s
        whisper.encoder._positional_embedding = full_positions[: frames // 2]
        try:
            mel = log_mel_spectrogram(mx.array(wav), n_mels=whisper.dims.n_mels)
            return whisper.embed_audio(pad_or_trim(mel, frames, axis=-2).astype(mx.float16)[None])
        finally:
            whisper.encoder._positional_embedding = full_positions

    def target_logprob(audio, word: str, language: str) -> float:
        tok = get_tokenizer(True, num_languages=whisper.num_languages, language=language, task='transcribe')
        sot = list(tok.sot_sequence_including_notimestamps)
        best = -1e9
        for form in {word, word.capitalize(), word.capitalize() + '.', word + '.', word.capitalize() + '!'}:
            ids = tok.encode(' ' + form) + [tok.eot]  # end-of-text too, so "mapa" can't pass as "map" + extra
            logits = whisper.logits(mx.array([sot + ids]), audio)[0].astype(mx.float32)
            logp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
            best = max(best, float(logp[mx.arange(len(sot) - 1, len(sot) - 1 + len(ids)), mx.array(ids)].sum()))
        return best

    def phonemes(wav) -> str:
        with torch.inference_mode():
            ids = phone_model(features(wav, sampling_rate=SAMPLE_RATE, return_tensors='pt').input_values).logits[0].argmax(-1).tolist()
        out, prev = [], -1
        for i in ids:
            if i != blank and i != prev and not vocab[i].startswith('<'): out.append(vocab[i])
            prev = i
        return ' '.join(out)

    def handle(req: dict) -> dict:
        started = time.perf_counter()
        wav = decode(req['audio'])
        peak = float(np.abs(wav).max()) if len(wav) else 0.0
        if peak < SILENT_PEAK:
            return {**score(req['ipa'], '', -99.0, peak, req['language']), 'ms': round((time.perf_counter() - started) * 1000)}
        # wav2vec2 (torch, CPU) on a worker thread while Whisper (MLX) runs here: MLX must stay on this thread.
        heard_future = cpu.submit(phonemes, wav)
        lp = target_logprob(encode(wav), req['word'], req['language'])
        heard = heard_future.result()
        result = score(req['ipa'], heard, lp if not is_silent(peak, heard) else -99.0, peak, req['language'])
        return {**result, 'ms': round((time.perf_counter() - started) * 1000)}

    def transcribe(req: dict) -> dict:
        """Full-window Whisper transcription primed with the expected answers; language picked from a short list."""
        started = time.perf_counter()
        wav = decode(req['audio'])
        peak = float(np.abs(wav).max()) if len(wav) else 0.0
        silent = lambda: {'text': '', 'language': None, 'silent': True, 'ms': round((time.perf_counter() - started) * 1000)}
        if peak < SILENT_PEAK: return silent()
        # Phoneme check, not just loudness: steady noise is loud, and Whisper can invent words from it.
        # It runs on a worker thread alongside Whisper; a silent verdict discards Whisper's text.
        heard_future = cpu.submit(phonemes, wav)
        base = get_tokenizer(True, num_languages=whisper.num_languages)
        first = whisper.logits(mx.array([[base.sot]]), encode(wav))[0, -1]
        language = max(req['languages'], key=lambda code: float(first[base.to_language_token(code)]))
        # The short window is fine for scoring a known word but loops on free decoding, so use the library's
        # full 30 s transcribe (KV cache, repetition fallbacks) on the already-loaded model.
        # The 0.4 retry stays for repetition loops (compression ratio), but a merely unsure decode isn't redone
        # (logprob_threshold=None): a mumbled kid answer used to cost a second full pass, ~3.4 s instead of ~0.8 s.
        out = mlx_transcribe(wav, path_or_hf_repo=args.whisper, language=language, initial_prompt=req['hint'] or None,
                             condition_on_previous_text=False, temperature=(0.0, 0.4), logprob_threshold=None, verbose=None)
        if is_silent(peak, heard_future.result()): return silent()
        return {'text': out['text'].strip(), 'language': language, 'silent': False, 'ms': round((time.perf_counter() - started) * 1000)}

    logging.info('Warming the listening models…')
    warm = base64.b64encode(silence_wav()).decode()
    handle({'word': 'hola', 'language': 'es', 'ipa': 'o l a', 'audio': warm})
    # The silent warm clip returns early from transcribe(), so warm the library's transcribe path directly:
    # otherwise the first kid's answer pays ~0.9 s of one-time setup.
    mlx_transcribe(decode(warm), path_or_hf_repo=args.whisper, language='en', condition_on_previous_text=False, verbose=None)
    logging.info('Pronunciation ready on http://127.0.0.1:%s', args.port)

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body):
            payload = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path != '/health': return self.reply(404, {'error': 'Not found'})
            self.reply(200, {'ready': True})

        def do_POST(self):
            routes = {'/score': (parse_request, handle), '/transcribe': (parse_transcribe_request, transcribe)}
            if self.path not in routes: return self.reply(404, {'error': 'Not found'})
            parse, run = routes[self.path]
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 8_400_000: raise ValueError('Invalid request size.')  # an 8 s PCM clip is ~3 MB, ~4 MB as base64
                req = parse(self.rfile.read(size))
            except (ValueError, UnicodeError) as exc:
                return self.reply(400, {'error': str(exc)})
            try:
                return self.reply(200, run(req))
            except (ValueError, subprocess.TimeoutExpired) as exc:
                return self.reply(400, {'error': str(exc) or 'Audio could not be decoded.'})
            except Exception:
                logging.exception('Scoring failed')
                return self.reply(500, {'error': 'Scoring failed.'})

    # Single-threaded on purpose: MLX GPU streams belong to the thread that loaded the models,
    # and clips are scored one at a time anyway (about 160 ms each).
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


def silence_wav() -> bytes:
    """A tiny valid WAV of near-silence plus a click, used to warm the models."""
    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b'\x00\x00' * 8000 + b'\xff\x3f' * 80 + b'\x00\x00' * 8000)
    return buf.getvalue()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    main()
