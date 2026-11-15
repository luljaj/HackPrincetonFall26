# Learning plan: live, parent-set, applied mid-run

## Goal

A parent can change what the kid is learning while an episode is playing. The kid's TV applies the change
in seconds, with no reload. The first parent-side controls are the Settings section and an API. The parent
AI chat comes later and only needs to call the same server function (out of scope now).

## What "the plan" is

One small record per learner (only `default` today):

| Field      | Values                                   | Applied on the kid side                          |
|------------|------------------------------------------|--------------------------------------------------|
| `language` | `""` (off) or `es fr de zh hi ja`         | Instant: at the next Dora line (same path as the language buttons, so dubbing, greeting and practice words switch together) |
| `focus`    | less / usual / more per mastery category (starts as math / english / science, see Mastery) | Soft: steers which pauses still ahead get asked |

Nothing private goes in it. The kid view can read it with the public Convex URL.

## Where it lives

- **Convex `plan` table** is the live copy, because the kid view subscribes to it.
- **Postgres `parent_preferences`** stays the durable record for `focus`, as it is today. Language isn't
  stored durably (a viewing's language is already saved per session in `play_sessions`).
- Only our server writes to Convex: the mutation checks `LIVE_PUBLISH_SECRET`, like `live.publish` already
  does. The browser never sees the secret.

## Pieces

1. **Convex** (`convex/schema.ts`, `convex/plan.ts`): a `plan` table indexed by learner; `plan.set`
   (secret-checked partial update) and `plan.get` (public query). *Built and deployed.*
2. **Server function** (`lib/live/plan.ts`, server-only): `setPlan({ language?, focus? })`. This is the one
   entry point; the future chat tool calls this and nothing else.
3. **Parent API** (`app/api/parent/plan/route.ts`): `GET` returns the plan; `PUT { language?, focus? }`
   is gated by `hasParentAccess`, validates with zod, and calls `setPlan`. The existing focus `PUT`
   (`/api/parent/preferences`) also calls `setPlan({ focus })`, so the Settings controls go live too.
4. **Kid view** (`app/page.tsx`): subscribes through `lib/parent/subscribe.ts` (the one file that knows the
   transport) and applies `language` through the existing `pickLanguage`, which also shows the
   "🇫🇷 LEARN FRANÇAIS" message on the TV. Unknown codes are ignored. The kid's own language buttons still
   work; the newest change wins.
5. **Focus on the kid side** (`app/lab/player.tsx`): weights which upcoming pauses get asked by subject.
   *Deferred:* `player.tsx` has another session's uncommitted work, and language is the part that's visible
   mid-run. This is next once that work lands.

## Behaviour

- On load, the kid view applies the current plan.
- A change mid-pause: Dora finishes the current line, and the next one comes in the new language.
- Convex not configured: the subscription does nothing, and the kid view works as it does today.
- The Convex write fails: the API returns 502; the focus is still saved in Postgres.

## Check

- Deploy Convex (`npx convex dev --once`).
- With the kid view playing, `PUT /api/parent/plan {"language":"fr"}`: the TV shows the language message
  and the next line is French. Then `{"language":""}` turns it off.
- Lint, typecheck and the existing tests pass.

## Mastery: everything Dora teaches, as categories of skills

### What's there today

The 67 lessons in `app/lab/lessons.json` each carry a loose `category` (counting, shapes, memory, picking,
language, joining in, imagination) and a `skill` (counting, shapes, places, objects, story, words, spanish,
imagination). `lib/play/skills.ts` maps skill to a parent topic, and `play.topics()` counts outcomes per
topic. That only gives counts ("Places: 13 questions"), not what the kid can actually do.

### The curriculum (`app/lab/mastery.json`, checked in)

Categories, each with concrete skills a parent would recognise. Every lesson is tagged with exactly one
skill id.

| Category | Skills (examples) |
|---|---|
| **Numbers** | count to 3 · count to 5 · count to 10 · count objects on screen |
| **Shapes** | name circle / square / triangle · match a shape to its gap |
| **Remembering** | recall the map's places in order · recall what just happened · recall an object from earlier |
| **Choosing** | pick the right path or place · pick the right object · say why |
| **Words** | name things · action words (up, down, across) · opposites |
| **Stories & imagination** | say what happens next · imagine and describe |
| **Joining in** | answer out loud · say the chant with Dora · do the action |
| **Languages** | one track per language being learned (es fr de zh hi ja), see below |

**Languages are their own track.** For each language, the skills are its words from the lessons
(`say_word` / translations: "arriba", "puente", "mochila"…), at three levels:

1. **Heard**: Dora taught it.
2. **Said**: the kid said it and pronunciation scored *good* or *close*.
3. **Remembered**: the kid said it well in two or more different viewings. (Dora always models the word first today, so "without Dora saying it first" can't be measured yet.)

### How tagging is done

`tools/build-mastery.py`: Luna assigns each lesson one skill id from the fixed list above (forced tool
call, so it can't invent ids), and it writes `mastery.json`. I review the output by hand. 67 lessons is small
enough to check every one. Re-run it when lessons change.

### Mastery levels per skill (from `play_turns`, no new tables)

- **New**: never asked.
- **Practising**: asked, but not yet "got it".
- **Got it**: correct on the first try at least 2 times, in at least 2 different sessions.
- **Rusty**: was "got it", but not seen in 14 days, or the last 2 attempts needed help.

Language words use the same levels from `practiceLanguage` / pronunciation verdicts, at the Heard → Said →
Remembered steps. The thresholds are constants in one file, to tune after watching real kids.

### Where it shows and what it drives

- **Parent view, Mastery section**: categories, each with its skills and level, plus a Languages block per
  language with its word list. This replaces today's topic counts.
- **No migration needed**: every saved turn already has its `spotId`, so its skill is looked up from
  `mastery.json` when reading (`lib/play/mastery.ts`). Old sessions count too. Skills that no lesson
  practises yet are hidden.
- **Learning plan `focus`** moves from math / english / science to these categories (less / usual / more
  per category). The kid side then prefers pauses whose skill is in a "more" category and not yet "got it".
  This is where step 5 above plugs in.
- **Later, the parent chat** can read mastery ("what is she good at?") and set focus ("more counting").

## Order

1. Live plan with language (pieces 1 to 4): lands first, small.
2. Curriculum: `build-mastery.py`, then `mastery.json`, then review.
3. The `skill_id` migration, mastery levels, and the parent Mastery section.
4. Focus per category, and the kid-side pause weighting (piece 5).

## Status (2026-11-14)

Built: pieces 1 to 4, the curriculum (65 of 67 lessons tracked, 11 hand fixes in `OVERRIDES`), mastery
levels, the parent Mastery section, and focus per category (Settings, Postgres, live plan).
Not built: piece 5, the kid-side pause weighting by focus. It waits for the other session's uncommitted
`player.tsx` work to land.

## Later (not now)

- Parent chat tool `set_plan` that calls `setPlan` ("switch her to French", "more math").
- Per-learner plans once there's more than one learner.
