# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["chatterbox-mlx==1.3.1"]
# ///
"""Resident local TTS: uv run tools/voice-server.py. Streams watermarked PCM as NDJSON."""
import argparse
import base64
import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from voice_runtime import PROFILE, load_voice, parse_speech_request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', default=str(PROFILE))
    parser.add_argument('--engine', choices=['turbo', 'nano'], default='turbo')
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    model, profile = load_voice(args.profile, args.engine)
    busy = threading.Lock()
    logging.info('Warming the voice model…')
    model.generate('Hola! Let us learn together.', seed=42)
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
            self.json_response(200, {'ready': True, 'voice': profile['id'], 'engine': args.engine, 'fineTuned': profile['fine_tuned'], 'sampleRate': model.sr, 'busy': busy.locked()})

        def do_POST(self):
            if self.path != '/speech':
                return self.json_response(404, {'error': 'Not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('Invalid request size.')
                text = parse_speech_request(self.rfile.read(size))
            except (ValueError, UnicodeError) as exc:
                return self.json_response(400, {'error': str(exc)})
            if not busy.acquire(blocking=False):
                return self.json_response(429, {'error': 'Voice is busy. Try again shortly.'})
            stream = None
            headers_sent = False
            started = time.perf_counter()
            try:
                import numpy as np
                stream = model.generate_stream(text, seed=42)
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
                    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes()
                    emit({'type': 'audio', 'pcm': base64.b64encode(pcm).decode()})
                emit({'type': 'start', 'sampleRate': model.sr, 'voice': profile['id']})
                first_audio = time.perf_counter() - started
                emit_audio(first)
                for chunk in stream:
                    emit_audio(chunk)
                emit({'type': 'done', 'firstAudioSeconds': round(first_audio, 3), 'generationSeconds': round(time.perf_counter() - started, 3)})
            except (BrokenPipeError, ConnectionResetError):
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
                if stream is not None:
                    stream.close()
                busy.release()
                self.close_connection = True

    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    main()
