# Live Dora voice: November 15, 2026

The live server now uses the V3 multilingual model with the two-step MeanFlow decoder. The previous five-step MLX decoder remains available with `--vocoder mlx`; saved-line generation still uses it. Both decoders use the existing Dora reference, disabled Turbo adapter, watermark and continuous output filtering.

## Warm decoder comparison

Measured local HTTP request → first received PCM, five runs per case and decoder, alternating decoder order. Both servers used the new streaming implementation, identical text, seed, reference, filtering and V3 checkpoint. Each case was warmed first; the Hindi word was already cached. Two model instances were resident for this comparison. These are voice-only timings, excluding microphone endpointing, transcription, Luna and the browser's 160 ms playback buffer.

| Text | Five-step MLX: median (range) | MeanFlow: median (range) |
| --- | --- | --- |
| “Yes! That is the map. Can you say map?” | 836 ms (804–841) | 343 ms (337–383) |
| “Yes! नक्शा means map. Can you say नक्शा?” | 747 ms (698–848) | 267 ms (228–484) |

All 20 measured responses returned complete nonempty audio and a completion event, with no HTTP or stream errors. Simulating the player's scheduling from actual chunk arrival times and lengths found no buffer underruns with its existing 160 ms buffer. This is a small synthetic warm test, not a full conversation latency guarantee. The five-step decoder's windowed vocoding is the remaining limiter in that comparison; the installed Chatterbox implementation explicitly documents its slower-than-real-time streaming risk.

Whisper recognized the full English sentence under both decoders. For the mixed sentence it romanized नक्शा as “Nuk-Shah” under both, and decoded the MeanFlow opener “Yes” as “That's.” This is not a native Hindi pronunciation evaluation or proof of equivalent perceived voice quality. Samples were retained locally at `/tmp/dora-8766-{0,1}.wav` (MLX) and `/tmp/dora-8768-{0,1}.wav` (MeanFlow).

A CPU Resemblyzer comparison against `voices/dora/reference.wav` was similar for these samples: English cosine 0.8768 → 0.8776; mixed English/Hindi 0.9049 → 0.9083. These are identity proxies on two sentences, not human listening scores, and do not establish an audible improvement.

## Scheduling and cancellation checks

A real long speculative request was interrupted by an incoming live answer: background returned HTTP 429, the live request completed with HTTP 200. It waited 738 ms for the current generation chunk and received its first audio at 1.143 s. Preemption happens between model chunks, not during an in-flight model operation.

A disconnected queued request was removed before generation. Disconnecting an active stream released the model, and the next live request completed successfully. Health returned idle with zero queued requests afterward.

The production-shaped `/api/voice` proxy also returned complete PCM, rejected an invalid priority with HTTP 400, and released the local model when its streaming client disconnected.

One additional proxy request with an uncached Hindi word (“In Hindi, door is दरवाज़ा. Can you say दरवाज़ा?”) received first PCM at 536 ms, completed generation in 1.674 s, and had no predicted buffer gap. This is a single smoke test, not a cold-model or percentile result.

Unit checks cover priority/FIFO ordering, queue timeout/disconnect cleanup, language-span streaming before the next span runs, waveform equivalence of streaming trim/crossfades, and browser preparation cancellation while retaining completed language caches.

## Remaining conversation work

The child still finishes an utterance before the final transcript is submitted; Luna's structured reply completes before live synthesis starts. Streaming transcription, validated clause-by-clause model output and interruption during Dora's speech remain separate work. Rehearse with the real microphone and a native Hindi speaker before treating this as measured conversational responsiveness.
