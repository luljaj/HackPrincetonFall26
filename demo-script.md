# Demo script: Tellavision

The story: a kid watches Dora. The show itself stops, Dora talks to the kid, listens, teaches when they're
wrong, and teaches the answer in Spanish. Then a parent opens their view and says "now teach Sam Hindi",
and the cartoon switches on the spot.

About 4–5 minutes. Every moment below is a real pause in the real episode ("When I Grow Up"). Nothing is
re-edited. **Skip** on the remote (it shows "1/7 · …") jumps to the next moment from anywhere: over a
cartoon part, or out of a question you want to cut short.

---

## Before you go on stage

1. **Servers running** (one terminal each, from the `dora` repo):
   - App: `npm run dev -w web -- --port 3010` (or the dev server already on :3010)
   - Listening (speech to text + pronunciation): `uv run tools/pronounce-server.py`. It must report
     `{"ready": true}` at `localhost:8767/health`.
   - Dora's voice: `uv run tools/voice-server.py`. It must report `"ready": true` at `localhost:8766/health`.
2. **Two windows side by side, not two tabs.** Kid TV on the left: `http://localhost:3010/`. Parent
   view on the right: `http://localhost:3010/parent`. Browsers pause video in hidden tabs. The TV resumes
   and still catches its questions, but the show stalls while it's hidden.
3. **Use real Chrome, and allow the microphone** when the TV asks. The Claude in-app browser blocks the mic.
4. Sound on, and a quiet room if you can. The mic is always on; Dora waits for you to stop talking.
5. In the parent view, make sure **Learning focus** is all "Usual". "More Numbers" adds extra addition
   questions after the key count.
6. **Backup if the mic fails:** open the TV with `http://localhost:3010/?dev`. The tools drawer (press
   `` ` ``) has "Answers right", "Answers wrong" and "Stays silent" buttons, and a "Kid says…" box where you
   can type an answer for Luna to judge.

---

## The run

### 0. Open (≈15 s)

**Do:** click **Turn TV on**. The TV starts in Spanish: "Let's learn Español!".
**Say:** "This is Sam's TV. Dora's on, but this Dora can hear Sam."
**Do:** press **Skip to: 1/7 · Who helps when we're lost? ⏭** on the remote.

### 1. Feedback loop: "Who do we ask for help?" (≈40 s)

Lands at 2:46: Boots wants to go to the pyramid; Dora says "We don't know how to get to the pyramid."

- The show stops on Dora. **Dora:** "Who do we ask for help when we don't know which way to go?"
- **Kid (say it wrong on purpose):** "A dog?"
- **Dora gives a hint, not a "no".** Luna writes the line, e.g. "Not quite! We ask the map for help finding
  our way." She asks again.
- **Kid:** "The map!"
- **Dora celebrates**, then teaches the answer in Spanish: "In Spanish, map is *mapa*! Can you say mapa?"
- **Kid:** "mapa". The pronunciation is scored; Dora praises it or models it once more. The paused frame
  dissolves back into the show right before its next line.

**Say:** "Wrong answers get a hint, then choices, then Dora shows the answer. It's never just 'no'.
And every answer becomes a Spanish word."

### 2. Remembering: "Where do we go next?" (≈30 s)

**Do:** **Skip to: 2/7 · Where do we go next? ⏭**. It lands at 9:25, after they've rescued Benny at the
firehouse. Early on the Map said "firehouse, bridge, pyramid".

- **Dora:** "We went past the firehouse. Where do we go next?"
- **Kid:** "The bridge!" Dora celebrates, then teaches "*puente*". The kid says it.

**Say:** "That's memory. Sam has to remember the route from minutes ago."

### 3. The parent (≈45 s): switch to the right-hand window

- **Say:** "Here's what the parent sees." Point at Mastery: the map and route questions just showed up
  (Remembering), plus the Spanish words Sam said.
- Open the companion at the bottom and type: **"Now teach Sam Hindi"**.
- **On the TV, instantly:** "हिन्दी is next. Dora is finishing this question." if she's mid-question,
  otherwise straight away the card "Let's learn हिन्दी!". The show keeps playing; nothing talks over it.

**Say:** "No reload. The parent's plan goes to the TV live through Convex."

### 4. The cartoon is now teaching Hindi (≈30 s)

**Do:** **Skip to: 3/7 · Find the bridge ⏭**. It lands at 9:49.

- **Dora:** "Where is the bridge?" **Kid:** "There!" (or point and say it)
- **Dora:** "In Hindi, bridge is *पुल* (pul)! Can you say पुल?" **Kid:** "pul".

**Say:** "Same word as two minutes ago, *puente*, and now it's Hindi. The question stays in Sam's language;
only the word Dora teaches changed."

### 5. Optional, if time allows (≈20–30 s each)

| Skip to | Moment | Kind |
|---|---|---|
| Which shape fits? (14:27) | "What shape piece goes here?" (triangle, then *त्रिभुज*) | Making something |
| Count the keys (18:49) | "Let's count to see if we have all six keys. Count with me." | Numbers |
| Find the jewel (19:43) | "If you see the jewel, say jewel!" | Finding something |
| Swiper, no swiping! (20:38) | "Say it with us: Swiper, no swiping!" | Joining in |
| The end (21:14) | "We did it!" | Close |

**Close:** "Any cartoon, any language. The show waits for the kid, and the parent can steer it live."

---

## How the pauses look

- While Dora waits or listens, the paused frame holds with a slow push-in, so nothing in the background moves.
- Where Dora is the one on screen talking (moments 1, 2, 5 and 7), her mouth moves while she speaks, using a
  short loop from that very shot that starts and ends on the paused frame.
- The other moments hold the frame while she talks. Moment 6 (the jewel) is Mommy on screen, and moment 3
  has a moving bird, so it holds a second after the show's own pause, once the bird has walked off the
  bridge.

## What's real vs. prepared

- **Real, live:**
  - the pauses and the listening
  - speech to text (local Whisper)
  - judging (Luna, or an instant match for clear answers)
  - pronunciation scoring (works in any language)
  - Dora's replies in her voice (local voice model)
  - the parent chat, and the switch going to the TV through Convex
  - saved progress (Postgres)
- **Prepared:**
  - which moments pause in demo mode, and where Skip lands (`apps/web/app/lab/demo-edit.json`)
  - the question wording and translations (generated ahead of time with Luna, in `lessons.json` and
    `translations.json`)
- **Known limits:**
  - Dora's voice model isn't fine-tuned, so non-English words can sound off.
  - Pronunciation thresholds are guesses that haven't been tuned on real kids.
