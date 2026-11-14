# Dora voice adaptation — local pilot

- Base: `ResembleAI/chatterbox-turbo`, loaded through `chatterbox-mlx==1.3.1`.
- Actual training: rank-8 LoRA on attention and MLP projections in the final eight T3 layers; 1,048,576 learned parameters.
- Data: 74 automatically selected Dora speech excerpts (roughly 4.2 minutes) from the four local episodes. Demucs removed background accompaniment; Whisper re-transcribed the resulting vocals. Speaker labels have not been manually audited.
- Split: 51 clips from episodes 1–3 for training; 23 clips from episode 4 for validation. Episode 4 was never used in gradient updates.
- Training: 150 optimizer steps, batch size one, learning rate 0.0001, clipped gradient norm 1.0, random seed 42. Base decoder and base T3 weights remain unchanged.
- Selected checkpoint: step 100. Mean held-out next-speech-token cross-entropy decreased from 4.750633 to 4.540581. This is a token prediction metric, not a human voice-quality score.
- `checkpoints/adapter.safetensors`: trainable LoRA matrices, approximately 4 MB.
- `checkpoints/t3-dora-delta.safetensors`: fused replacement weights for the adapted layers. This file requires the matching pretrained base model and the reference recording.
- `profile.json`: inference configuration loaded by the batch generator and resident local server.
- `reference.wav`: separated and normalized Dora introduction from episode 1, 42.08–54.00 seconds.

The saved lab lines were generated from the selected checkpoint and checked against their captions. New live speech can still mispronounce words, vary in pitch, or sound unnatural; it has not been evaluated by a human listening panel. This pilot is English only. It is not a production model or a standalone model trained from scratch.

Generated speech keeps the base engine's Perth watermark. The 4 MB adapter, reference recording and training metadata are tracked in Git. The larger fused checkpoint, generated audio and dataset files remain local and ignored. See `../README.md` for commands and `checkpoints/adapter.json` / `training-history.json` for the actual run evidence.
