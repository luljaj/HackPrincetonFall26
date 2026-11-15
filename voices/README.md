# Dora voice

The local server and saved lab lines now use **Chatterbox Multilingual V3 (500M)**, with MLX on Apple Silicon. The checkpoint is pinned in `tools/voice_runtime.py`. The same Dora reference conditions every language. The experimental Turbo adapter remains disabled (`adapter_strength: 0`); it produced less consistent pitch and wording. To compare the old engine, use `--engine turbo` on either voice command.

The small trained adapter, training metadata and reference recordings are tracked in Git. Datasets, generated examples and the large fused checkpoint stay local. `dora/profile.json` controls the reference, adapter strength, temperature and output filtering for both saved and live speech. `reference-training.wav` preserves the lower-bandwidth reference used in the original training run.

The reference was extracted from 48 kHz episode audio, separated with Demucs, then resampled once to 24 kHz. Output uses a 65 Hz high-pass / 7.8 kHz low-pass, 6 dB gain to approach the episode's dialogue level, a peak safety knee and 5 ms endpoint fades. Filters preserve their state between streaming chunks. Saved audio uses 160 kbps AAC. Browser playback buffers the first 160 ms. Prepared dubs use FFmpeg `atempo` to fit their window without changing pitch; Web Audio never speeds up the voice.

## Use

From the repository root:

```sh
uv run tools/gen-voice-lines.py --verify
uv run tools/voice-server.py
```

With `--verify`, generation tries up to four deterministic seeds and checks the transcript before writing a line. Ordinary live English streams immediately. Mixed-script replies are prepared as language spans with the same voice conditioning, trimmed and joined with 10 ms crossfades; they take longer before first audio. Short foreign spans are cached in memory.

The generator reads `apps/web/app/lab/lines.json` and writes the existing `.m4a` files consumed by the lab. The server stays loaded at `127.0.0.1:8766`. Open `/lab`, start playback, and enable **Generate lines live**. You can also type a personalized reply and press **Speak reply**. Stopping speech or changing stages aborts generation and scheduled playback. Turning live generation off uses the saved lines.

The browser calls `POST /api/voice` with `{"text":"...","learningLanguage":"ja"}` for English teaching with Japanese words. `language` selects the utterance language (default English); `learningLanguage` disambiguates Japanese kanji from Chinese characters. Dubs also send `durationSeconds`, allowing silence trimming and pitch-preserving timing before playback. Native scripts are required; romanization is for display. The service returns NDJSON: sample rate, signed little-endian 16-bit PCM chunks, then completion timing. Playback drives the existing mouth analyser and finishes before the stage advances.

`GET http://127.0.0.1:8766/health` reports the actual engine, checkpoint, languages and adapter status. Live requests wait for the active line; speculative dubs retry when busy. Perth watermarking stays enabled. If speech is unavailable, the player keeps captions visible instead of swapping to an unrelated browser voice. Mixed Latin-language phrases still use the utterance's language setting and need listening review.

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
uv run tools/gen-voice-lines.py --engine turbo --base --only ask teach1 --out voices/dora/evaluation/base
uv run tools/gen-voice-lines.py --engine turbo --adapter-strength 1 --only ask teach1 --out voices/dora/evaluation/tuned
```

These data were selected automatically and remain candidates for human speaker/transcript review. Music separation can leave artifacts. Lower token loss alone does not prove better voice similarity or natural delivery. Audit the generated examples before using them with children. Existing extracted MP3s are not all suitable training data.

See `dora/QUALITY_REPORT.md` for the controlled comparison and its limits. Pre/postprocessing can reduce noise and playback clicks; it cannot guarantee the original actor's exact timbre, pronunciation or delivery.
