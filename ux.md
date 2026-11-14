# UX brief

How a Dora episode becomes an interactive one, end to end. One episode (ep3, "When I Grow Up") runs fully today; the rest follow the same steps.

## The idea

At every pause in the show, Dora turns to the kid, asks, listens, and either celebrates or teaches. Then the show resumes. The show's own next line is the answer, so every pause is a lesson. What the kid says becomes insights for the parent (words, counting, objects, emotions).

## Pipeline

```
DVD episode ─► mp4 + transcript ─► spots ─► loop clips ─► lines + voice ─► Play mode (stage machine) ─► kid's answer ─► judge ─► insights ─► parent view
```

| Step | What happens | Where |
|---|---|---|
| 1. Episode | DVD chapters → 640x480 H.264 mp4. The trial episode is served from Cloudflare R2. | `apps/web/app/lab/episode.json` |
| 2. Transcript | Whisper (large-v3-turbo) with word timestamps | scratch tooling |
| 3. Spots | Every question or "say / can you / help" prompt → `{t, pauseAt, resumeAt, gap, talk, wait}`. `custom` spots have hand-written lines. | `apps/web/app/lab/spots.json`, `episode-analysis.md` |
| 4. Loop clips | For each spot, a seamless talk loop and wait loop: boomerang clips that never cross a camera cut. The wait loop starts on the exact pause frame. | `python3 tools/cut-loops.py` → `public/media/loops/` |
| 5. Lines | All of Dora's lines live in one file, which the generator and the captions both read. | `apps/web/app/lab/lines.json` |
| 6. Voice | Pre-made lines: `uv run tools/gen-voice-lines.py [--only ids] [--verify]`. Live replies: `uv run tools/voice-server.py` (streams PCM). | `voices/dora/`, `public/media/lab/` |
| 7. Playback | A pure stage machine drives a frozen episode frame, crossfaded loops, and Dora's audio. | `apps/web/app/lab/machine.ts`, `page.tsx` |
| 8. Judge | Kid's speech → transcript → CORRECT / WRONG / UNCLEAR | `apps/web/server/pipeline/` |
| 9. Insights | Each turn is written as a learning event | `apps/web/server/storage/` |
| 10. Parent view | Live session progress and insights | `apps/web/app/parent/` (real) · `apps/parent/` (mock prototype) |

## Stage machine

`watching → entering → asking → listening → thinking → celebrating → exiting → watching`

When the kid gets it wrong, Dora teaches instead of just giving the answer. Each step is one wrong answer:

1. **teach1**: a clue ("It goes click, across your tummy…")
2. **teach2**: choices ("Is it a seatbelt, or a sandwich?")
3. **model**: says the answer and invites a repeat ("It's a seatbelt! Can you say seatbelt?"). If the kid repeats it, Dora celebrates.
4. **give**: a warm wrap-up, then the show continues.

Other paths:

- Silence → one nudge, then model.
- Mumbling → one clarify, then model.
- Pipeline error → a graceful exit.
- The kid switching channel → "Ayyy, you're back!"

Spots without a known answer skip the model step, and the show reveals the answer itself.

Tests: `node --test apps/web/app/lab/machine.test.ts`

## Turn judging and pronunciation

- **Luna judge** (`/api/judge`, `server/judge/judge.ts`): one tool call picks the stage-machine event (`correct` / `wrong` / `unclear`) and writes Dora's next line, told in advance what the machine will do for each event. 26/26 on the test answers, about 1.2 s.
- **Pronunciation** for "say X" spots (`spots.json` → `say: {word, language, ipa}`): `uv run tools/pronounce-server.py` (port 8767), reached through `/api/pronounce`.
  - Verdict comes from Whisper's likelihood of the target word plus end-of-text, using a 4 s window: good / close / retry / silent.
  - The sound to coach comes from wav2vec2-xlsr espeak phonemes, aligned to the target with kid-lenient costs (any r is fine, b/β/v and seseo are free, r↔l costs half).
  - About 100 ms per clip: Whisper and the phoneme model run at the same time. Both models are multilingual, so another language only needs target IPA for each word.
  - The verdict forces Luna's tool, so Luna only writes the line. Only the sound to model is sent to Luna, never what the kid got wrong.
  - Cutoffs were tuned on 198 synthetic clips (on mic-style recordings: 88% of attempts praised, 83% of wrong words caught). The results hold for clean and mic-style recordings alike: clips are trimmed and padded, and the browser records lossless PCM. Retune on 20–30 real kid recordings.

## The spoken loop (hands-free)

Turn on **🎙 Hands-free** in `/lab`. Each listening stage then:

1. Opens the mic. Energy-based voice detection (`app/lab/listen.ts`) decides when the kid starts and stops.
2. Sends the clip to `/api/transcribe` (local Whisper, primed with the question and answer), or to `/api/pronounce` for "say X" spots.
3. Luna picks the event and Dora's line.
4. Dora speaks: the voice server if it's running, otherwise the browser's own speech synthesis.

Silence → nudge. A failed step re-arms the mic.

**Turn-taking speed.** People usually start their turn within a few hundred ms of the other person finishing:

- **First sound in about 0.5 s:** the moment the kid stops (500 ms of quiet), Dora says "Hmm!". The audio is `hmm` in `lines.json`; generate it with `tools/gen-voice-lines.py --only hmm`. Until then it uses the browser voice.
- **Real answer in about 1.2 s when it's clear:** if the transcript matches an accepted answer (`accept` in `spots.json`, allowing about one slip per four letters, so "Seedbelt" counts), or the pronunciation verdict is good, Dora plays her pre-made line without calling Luna.
- **Luna only when needed:** wrong, unclear, or close-but-coachable answers go to Luna (about 1.3–2 s; lower reasoning settings weren't faster), with the "Hmm!" covering the wait.
- **Honest timing:** measured from the kid's last sound and shown in the lab panel.

Run it:
```bash
uv run tools/pronounce-server.py
```
Optionally also start `uv run tools/voice-server.py`.

## Fast and cheap at runtime

Nothing is generated during a session if we can help it:

- All replies for each spot are pre-made clips: ~67 spots × ~6 lines, generated once, served statically.
- Live speech generation (`voice-server.py`) is only a fallback, for example for a kid's name.
- Listening runs on the device: VAD in the browser, then local Whisper primed with the expected answers.
- Judging is a word match first, with a small LLM only when that's unsure.
- Target: about 0.5 s from the kid finishing to Dora answering, with nothing paid per session.

## Apps

| App | URL | What |
|---|---|---|
| Play mode | `apps/web` → `/` (port 3010 locally) | TV with channels: Dora, Bluey, Peppa, Daniel Tiger |
| Lab | `/lab` | Stage-machine playground: a spot timeline, simulated kid buttons, and a live graph |
| Parent view | `/parent` | Real dashboard (Postgres) |
| Parent mock | `apps/parent` (port 3011) | Early mock. **Folded into `/parent` (Nov 14):** same layout and chips, real data. Can be removed once nobody needs it for reference. |

## Open

- Generate audio for the new lines: `uv run tools/gen-voice-lines.py --only teach2 model g_teach2 --verify`.
- Write per-spot lessons (answer, clue, choices) for the generic spots, so every spot gets the full teaching ladder.
- Connect the mic → VAD → judge to the stage machine in Play mode (the lab still uses buttons).
- Episodes 1, 2 and 4 still need the same steps.
- Media rights: episodes and voice are for a private demo only. Don't publish them.
