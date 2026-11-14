# Dora voice

This directory holds a local Chatterbox Turbo voice fine-tune. It adapts the final eight T3 transformer layers with rank-8 LoRA (1,048,576 trainable parameters). The vocoder and base weights stay frozen. This is an experimental speaker adaptation, not a model trained from scratch.

The small trained adapter, training metadata and reference recording are tracked in Git. Datasets, generated examples and the large fused checkpoint stay local. `dora/profile.json` identifies the reference recording and, after training, the trained LoRA adapter loaded by both the generator and the service.

## Use

From the repository root:

```sh
node --version # >=24
npm --version # exactly 11.19.0
npm ci
uv run tools/voice-server.py
```

In a second terminal, run `npm run dev -- --filter=web` and open
[the lab](http://localhost:3000/lab). Wait for `curl http://127.0.0.1:8766/health`
to report readiness before enabling live lines. The voice server needs its local
model dependencies and trained adapter; installing npm packages alone does not
provide them. Without the local voice runtime, turn **Generate lines live** off
to use checked-in saved lines. **Speak reply** always requires the live runtime.

To regenerate saved lines explicitly, run `uv run tools/gen-voice-lines.py --verify`.
With `--verify`, generation tries up to four deterministic seeds and selects speech using Whisper transcript checks before writing a line. Live speech streams immediately and does not wait for this offline check.

The generator reads `apps/web/app/lab/lines.json` and writes the existing `.m4a` files consumed by the lab. The server stays loaded at `127.0.0.1:8766`. Open `/lab`, start playback, and enable **Generate lines live**. You can also type a personalized reply and press **Speak reply**. Stopping speech or changing stages aborts generation and scheduled playback. Turning live generation off uses the saved lines.

The browser calls `POST /api/voice` with `{"text":"..."}`; Next.js proxies to the local speech service. The service streams newline-delimited JSON: a sample-rate header, base64 signed little-endian 16-bit PCM chunks, and a completion message with observed generation timing. Audio goes through the same Web Audio analyser as saved lines, so the mouth animation follows it. The state machine advances after audio playback finishes, rather than when generation ends.

`GET http://127.0.0.1:8766/health` reports readiness. The local server serializes model access and rejects overlapping requests. Chatterbox's Perth watermark remains enabled. Turbo is an English model; Hindi requires a separately tested multilingual model.

## Verification

Run `npm run test:lab -w web` for deterministic stage-machine, NDJSON playback,
cancellation/replacement and proxy checks, and `python3 tools/voice_runtime_test.py`
for runtime request validation. These tests mock Web Audio/fetch; they do not
establish audible voice quality or model performance. Exercise saved/live lines,
**Stop speaking**, repeated **Speak reply**, channel switching and spot jumps in
a browser with the local runtime for integration verification. The lab remains a
simulation harness: its kid-answer buttons do not record a microphone or call the
learning pipeline.

## Reproduce training

```sh
uv run tools/prepare-voice-dataset.py --source /path/to/folder-containing-ep1.wav-through-ep4.wav
uv run tools/transcribe-voice-dataset.py
uv run tools/train-dora-voice.py --steps 150
```

Preparation reads the extraction index in `~/Downloads/dora samples/sample-index.csv`, selects stronger speaker matches, separates music with Demucs, and exports WAVs. Whisper re-transcribes the separated speech. Episodes 1–3 are used for training and episode 4 is held out. Cached speech-token targets live in `dora/dataset/tokens.npz`; regenerate that file if you change the audio or manifest.

Training logs and checkpoints live in `dora/dataset/training.log` and `dora/checkpoints/`. Only checkpoints improving held-out token loss over the base are saved. The adapter metadata records the split and validation results. `adapter.safetensors` contains the learned matrices; the runtime merges them into the matching base model in memory. The larger `t3-dora-delta.safetensors` is an optional local fused export and is not needed to run the voice.

Compare base and fine-tuned speech:

```sh
uv run tools/gen-voice-lines.py --base --only ask teach --out voices/dora/evaluation/base
uv run tools/gen-voice-lines.py --only ask teach --out voices/dora/evaluation/tuned
```

These data were selected automatically and remain candidates for human speaker/transcript review. Music separation can leave artifacts. Lower token loss alone does not prove better voice similarity or natural delivery. Audit the generated examples before using them with children. Existing extracted MP3s are not all suitable training data.
