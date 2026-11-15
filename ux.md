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

## Lessons: a clear question at every pause

Spot detection finds where the show pauses, but many of those lines aren't questions to the kid ("I know what I want to be.") or are said between characters.

`python3 tools/build-lessons.py <transcript.json>` sends Luna the transcript around each pause, including the show's next line, which is usually the answer. It writes `apps/web/app/lab/lessons.json`:

- Dora's question (clear, under 16 words, never addressing herself)
- the expected answer (what the show reveals next) and accepted variants
- the type: answer, say, open, choice or count
- `visual`: whether the kid needs to see the scene

For every spot, Dora asks the lesson question out loud. Her nudges, re-asks, modelling and answer reveal are built from it. Hand-written fields in `spots.json` win over generated ones (for example ep3-25's answer, and Diego where Whisper heard "Beagle").

**Dora never leaves her scene.** While she asks and waits, the picture stays where the show is:
- **Where the show itself waits for the viewer** (same camera shot, little movement), that waiting moment is looped, with the prompt just before it as the talk loop. `tools/cut-loops.py` measures motion, cuts these for 30 spots and writes `loops.json`.
- **Everywhere else** the paused frame is held with a very slow push-in. No cutting to a saved close-up from another scene.

**Which pauses are asked.** A question must be answerable from what the kid has already seen or heard, be the show's own prompt to the viewer, or be a guess ("What do you think…?"). It is never a fact that only comes after the pause. `build-lessons.py` then picks the demo set:
- every skill covered: counting, shapes, language, picking the right thing, remembering, imagination
- no near-duplicate questions
- at least 35 s apart, except the show's own runs such as three shape questions in a row
- capped at 18, so the 24-minute story finishes in about 30 minutes

`--reselect` redoes the choice without calling Luna. After each pause the show resumes 0.3 s before the next line, so its first word isn't clipped.

## Learning another language

Pick a language under **🌍 Learn** in `/lab`: Spanish, French, German, Chinese, Hindi or Japanese.

After each spot's answer (the kid got it, or Dora gave it), the stage machine adds a **practicing** step. Dora says "In French, seatbelt is *ceinture de sécurité*! Can you say ceinture de sécurité?" and listens once. The pronunciation scorer judges in that language: "Yes! … You said it in French!", or Dora models it once. Then the show resumes, with no nagging.

- `python3 tools/build-translations.py [--langs …]` asks Luna for each answer's child-level word, a romanization (pinyin, romaji…) and IPA. It writes `apps/web/app/lab/translations.json` (51 spots; names, "yes" and sentences are skipped). Bad romanizations are dropped.
- **The cutoffs differ per language,** because the same correct word scores lower in some scripts. These were measured on native macOS voices, right word vs a different word: de 14/14 right praised and 14/14 wrong caught, fr 14/14 and 12/14, ja 12/14 and 14/14, zh 13/14 and 13/14, hi 5/7 and 7/7. Small samples, so retune with real kids.

## Live updates: Convex for live, Postgres for the record

- **Postgres** (Andrea's Tiger Cloud / Timescale tables) is the durable record: sessions, interactions, `learning_events`, insights.
- **Convex** carries only short-lived live events, pruned after a day. They're what makes `/parent/live` update the instant something happens.

```
lab stage change ──► /api/lab/turn ──┐
pipeline saved turn ──► publish hook ─┴─► Convex live:publish (checks LIVE_PUBLISH_SECRET) ──► parent useQuery-style subscription
```

- **Lab:** every meaningful stage (asking, outcome, practising a word, back to the show) publishes `{stage, question, outcome, verdict, skill, language, practiceWord}`. **Never what the child said.**
- **Pipeline:** Luka's documented publish hook sends `{sessionId, interactionId, turnNumber}` after each saved turn, and the dashboard refetches its own authorised view.
- **Transport:** `lib/parent/subscribe.ts` is still the only file that knows it. It uses Convex, resyncs every 15 s as a safety net, and polls every 2 s if Convex isn't configured.
- **Parent view:** `/parent/live` shows a **Right now** card. Measured: a lab event appears in about 190 ms, with no refresh.
- **Setup:** run `npx convex dev` in `apps/web` (writes the URL to `.env.local`), then set `LIVE_PUBLISH_SECRET` on the deployment and in `.env.local` (see `.env.example`). Convex reads are unauthenticated, which is why nothing private is ever sent.

### The show itself follows the language (dubbing)

The episode is English with Spanish baked into the recording ("Hola, soy Dora", "¿Dónde está? Where is the bridge?"). When another language is picked, Dora's Spanish lines are re-voiced **as whole sentences** in the voice model, so each sentence stays one voice: "Bonjour, je suis Dora.", "To get the ladder up, we say, En haut."

- `python3 tools/build-dubs.py <transcript.json>` writes `apps/web/app/lab/dubs.json`. For each transcript line with Spanish, Luna judges the speaker from the dialogue and rewrites the line per language (English kept, Spanish swapped, non-Latin romanised). **Only Dora's lines are dubbed.** Speaker calls were read by hand and unclear ones pinned off in `SPEAKER_OVERRIDES` (21 lines dubbed in ep3).
- While watching, the player fetches the next dub 6 s ahead, ducks the show's audio and plays it on cue, trimmed of silence and sped up at most 1.2× to fit. If the voice server is busy or off, the show plays its own line.
- "Say it" pauses then ask for the word in that language ("Can you say en haut?") and score that word.
- Limits: lips don't match; a dub slightly longer than its line can cover the next speaker's first syllable; music under a dubbed line dips with it.

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
