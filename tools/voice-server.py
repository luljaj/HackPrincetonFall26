# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["chatterbox-mlx==1.3.1", "scipy"]
# ///
"""Resident local TTS: uv run tools/voice-server.py. Streams watermarked PCM as NDJSON."""
import argparse
import base64
import json
import logging
import select
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from voice_runtime import PROFILE, load_voice, parse_voice_request, generation_options, speech_parts
from voice_audio import processor_for, polish_audio, fit_dub, join_speech, stream_join_speech
from voice_queue import VoiceQueue


class SpeechPreempted(Exception):
    pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', default=str(PROFILE))
    parser.add_argument('--engine', choices=['turbo', 'nano', 'multilingual'], default='multilingual')
    parser.add_argument('--vocoder', choices=['mlx', 'meanflow'], default='meanflow')
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    model, profile = load_voice(args.profile, args.engine, vocoder=args.vocoder)
    queue = VoiceQueue()
    word_cache = {}
    logging.info('Warming the voice model…')
    if args.engine == 'multilingual':
        for code, word in [('fr', 'Bonjour'), ('de', 'Hallo'), ('zh', '地图'), ('hi', 'नक्शा'), ('ja', '地図')]:
            model.tokenizer.text_to_tokens(word, language_id=code)
    model.generate('Hola! Let us learn together.', **generation_options(profile, args.engine))
    logging.info('Voice ready on http://127.0.0.1:%s (%s)', args.port, args.engine)

    class Handler(BaseHTTPRequestHandler):
        def json_response(self, status, body):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path != '/health':
                return self.json_response(404, {'error': 'Not found'})
            self.json_response(200, {'ready': True, 'voice': profile['id'], 'engine': args.engine,
                'checkpoint': 't3_mtl23ls_v3' if args.engine == 'multilingual' else args.engine,
                'vocoder': args.vocoder if args.engine == 'multilingual' else args.engine,
                'languages': ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ja'] if args.engine == 'multilingual' else ['en'],
                'fineTuned': profile['fine_tuned'], 'sampleRate': model.sr, **queue.status()})

        def disconnected(self):
            try:
                readable, _, _ = select.select([self.connection], [], [], 0)
                return bool(readable) and not self.connection.recv(1, socket.MSG_PEEK)
            except OSError:
                return True

        def do_POST(self):
            if self.path != '/speech':
                return self.json_response(404, {'error': 'Not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('Invalid request size.')
                text, language, duration, learning_language = parse_voice_request(self.rfile.read(size))
                priority_name = 'dub' if duration is not None else self.headers.get('X-Voice-Priority', 'live')
                if priority_name not in ('live', 'prepare', 'dub'):
                    raise ValueError('Invalid speech priority.')
                priority = ('live', 'prepare', 'dub').index(priority_name)
                parts = speech_parts(text, language, learning_language)
                if any(code != 'en' for code, _ in parts) and args.engine != 'multilingual':
                    raise ValueError('This engine only supports English. Start with --engine multilingual.')
            except (ValueError, UnicodeError) as exc:
                return self.json_response(400, {'error': str(exc)})
            started = time.perf_counter()
            try:
                acquired = queue.acquire(priority, self.disconnected)
            except ConnectionAbortedError:
                return
            if not acquired:
                return self.json_response(429, {'error': 'Voice is busy. Try again shortly.'})
            queued_seconds = time.perf_counter() - started
            stream = None
            model_streams = []
            headers_sent = False
            try:
                import numpy as np

                def check_current():
                    if self.disconnected():
                        raise ConnectionAbortedError('Speech client disconnected.')
                    if queue.should_yield(priority):
                        raise SpeechPreempted()

                def part_audio(code, span):
                    check_current()
                    key = (code, span)
                    cached = word_cache.get(key)
                    if cached is not None:
                        yield cached
                        return
                    generated = model.generate_stream(span, **generation_options(profile, args.engine, code))
                    model_streams.append(generated)
                    cache_word = code != 'en' and len(span) <= 32
                    chunks = []
                    for chunk in generated:
                        check_current()
                        if cache_word:
                            chunks.append(chunk)
                        yield chunk
                    if cache_word and chunks:
                        if len(word_cache) >= 128:
                            word_cache.pop(next(iter(word_cache)))
                        word_cache[key] = np.concatenate(chunks)

                if duration is not None:
                    pieces = [np.concatenate(list(part_audio(code, span))) for code, span in parts]
                    samples = join_speech(pieces, model.sr) if len(pieces) > 1 else pieces[0]
                    samples = polish_audio(samples, model.sr, profile)
                    check_current()
                    samples = fit_dub(samples, model.sr, duration)
                    stream = iter([samples])
                    processor = None
                else:
                    streams = (part_audio(code, span) for code, span in parts)
                    stream = stream_join_speech(streams, model.sr) if len(parts) > 1 else part_audio(*parts[0])
                    processor = processor_for(profile, model.sr)
                first = next(stream)
                self.send_response(200)
                self.send_header('Content-Type', 'application/x-ndjson')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                headers_sent = True
                def emit(data):
                    self.wfile.write(json.dumps(data).encode() + b'\n')
                    self.wfile.flush()
                def emit_audio(samples):
                    if not len(samples):
                        return
                    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes()
                    emit({'type': 'audio', 'pcm': base64.b64encode(pcm).decode()})
                emit({'type': 'start', 'sampleRate': model.sr, 'voice': profile['id']})
                first_audio = time.perf_counter() - started
                emit_audio(processor.process(first) if processor else first)
                for chunk in stream:
                    check_current()
                    emit_audio(processor.process(chunk) if processor else chunk)
                if processor:
                    emit_audio(processor.finish())
                emit({'type': 'done', 'firstAudioSeconds': round(first_audio, 3), 'queueSeconds': round(queued_seconds, 3),
                    'generationSeconds': round(time.perf_counter() - started, 3)})
            except SpeechPreempted:
                logging.info('Yielding speculative speech to a higher-priority reply.')
                try:
                    if headers_sent:
                        self.wfile.write(b'{"type":"error","error":"Preparation interrupted by a live reply."}\n')
                        self.wfile.flush()
                    else:
                        self.json_response(429, {'error': 'Live speech takes priority. Try again shortly.'})
                except OSError:
                    pass
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                logging.info('Speech client disconnected; stopping generation.')
            except Exception:
                logging.exception('Speech generation failed')
                if headers_sent:
                    try:
                        self.wfile.write(b'{"type":"error","error":"Speech generation failed."}\n')
                        self.wfile.flush()
                    except OSError:
                        pass
                else:
                    self.json_response(500, {'error': 'Speech generation failed.'})
            finally:
                try:
                    if stream is not None and hasattr(stream, 'close'):
                        stream.close()
                    for generated in model_streams:
                        generated.close()
                finally:
                    queue.release()
                self.close_connection = True

    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    main()
