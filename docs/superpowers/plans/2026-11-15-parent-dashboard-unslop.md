# Parent Dashboard Scoped Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use installed `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Apply the accepted copy, Mastery, Roadmap and companion fixes while keeping Tellavision’s visual identity.

**Architecture:** Retain current server data readers, client controls, Radix tabs and parent page sections. Edit presentation in place; no new libraries or backend contracts.

**Tech Stack:** Next.js 16 App Router, React, Tailwind v4, existing CSS and Radix.

**Spec:** `.superpowers/parent-unslop-run/request.md` (latest user steering overrides original proposals).

## Global Constraints

- Preserve Home yellow/blue radial styling, glossy artwork, palette, typography, flower geometry and normal navigation. No compact nav or global restyling.
- Preserve Mastery naming, existing evidence, sample provenance, uncertainty and necessary consequences. Accessibility mode keeps its name and demo behavior.
- Delete redundant headings and UI narration without replacement filler. Keep actual content and explanatory evidence.
- No backend, API, data, storage, migrations, dependencies, pre/post checks or other future work. No push, merge, deploy, commits or staging: preserve the existing dirty baseline in this requested checkout.
- Working directory `/Users/lukauljaj/Projects/Hackathons/HackPrincetonFall26`, branch `codex/mastery-swipe-cards`, initial HEAD `6c38c522e50363fa714184747a77a0efe62b8d7a`. Node >=24, npm exactly 11.19.0.
- Read root/app AGENTS.md and installed Next client/CSS docs before edits. UI inspection uses cua_repl only. One implementation worker at a time; independent reviews compare against baseline snapshots.

## Review Focus

- No selected Mastery subject: detail is compact and does not reserve 540px.
- Narrow viewports and long evidence: Mastery uses normal vertical flow with visible controls.
- Roadmap arrows, keyboard and thumbnail selection: one selected large card and matching visible active thumbnail.
- Empty/changed roadmap subjects: selection never produces a blank invalid card or out-of-range action.
- Zero/all-unclear weekly counts and reduced motion: count graphic remains truthful; controls remain usable.

### Task 1: Scoped Home, Mastery and companion cleanup

**Files:** Modify `apps/web/app/parent/page.tsx`, `_components/parent-nav.tsx` if it holds Navigate (locate exact owner), `_components/week-gauge.tsx`, `topics/mastery.tsx`, `topics/mastery-carousel.tsx`, `parent.css`, `_components/chat-panel.tsx`, `_components/chat-panel.module.css` only as necessary. Optional pure gauge calculation/test under `apps/web/lib/parent/` only if computation warrants it.

**Interfaces:** Preserve WeekGauge props `{ firstTry, afterHelp, missed, unclear? }`, MasterySection props, existing carousel controls, chat state machine/focus/submission/preferences. No renaming exports.

- [ ] Remove `Breakdown`, `Navigate`, duplicate generic subject-selection prose and carousel instruction filler; retain the concise no-selection prompt and evidence.
- [ ] Remove the fixed 540px Mastery detail height/nested vertical scroller. Use content-height detail with compact empty state, avoid stretching empty card to flower height; preserve selected content, language controls and flower selection/focus.
- [ ] Keep the original weekly gauge exactly as captured before task. Latest user explicitly requested reverting the gauge changes, including original artwork, hover behavior and CSS; remove new gauge-only helpers/tests.
- [ ] For absent episode titles render `Untitled episode`, without empty quotation marks; preserve session links and sample labels.
- [ ] Speed companion intro choreography to roughly half its current timings, preserving stage ordering, focus/keyboard mechanics and reduced-motion behavior. Change only intro timings, not unrelated response/spinner animation or artwork.
- [ ] Run relevant targeted tests plus web lint/type checks, self-review diff against provided snapshot, and report exact changes and evidence. No implementation-mirroring tests for CSS/copy.

### Task 2: One Roadmap card with synchronized thumbnails

**Files:** Modify `apps/web/app/parent/preview/roadmap-cards.tsx`, `preview/page.tsx`, Roadmap selectors in `parent.css`.

**Interfaces:** Preserve `RoadmapCards({ subjects }: { subjects: ReturnType<typeof subjectRoadmaps> })` input shape and checkpoint data. Keep existing Radix keyboard tab semantics or equivalently accessible native controls.

- [ ] Delete Roadmap intro (`one subject at a time`, `Choose a card...`), selection narration, and redundant Learning path eyebrow. Keep the draft curriculum/grade-placement/planned-topic caveat.
- [ ] Show exactly one large selected roadmap card with previous/next arrows in its upper corner. Keep subject name and checkpoint status/count content. Disable arrows at boundaries.
- [ ] Replace the full-size subject grid with a compact horizontal thumbnail strip (small icon/name cards) ABOVE the main stage (latest explicit user correction). Selection via arrow, keyboard or thumbnail must update the same selected subject and horizontally reveal its thumbnail without moving page scroll. Preserve visible active state and focus.
- [ ] Preserve glossy checkpoint token art, path structure, grades, states and existing checkpoint vertical exploration. Do not simplify these into generic cards. Preserve existing responsive behavior; thumbnails scroll horizontally. Latest user instruction: “dont worry abt mobile”; no mobile-specific implementation or checks.
- [ ] Handle no subjects and subjects changing on refresh with valid fallback selection. Preserve reduced motion and existing keyboard behavior. Swipe is optional: do not add a gesture library or interfere with vertical checkpoint scrolling.
- [ ] Run web lint/type checks; coordinator will inspect desktop selection, boundaries, thumbnail reveal, and normal scroll behavior with CUA.

## Final verification

- [ ] Independent task reviews and final Astra whole-change review; preserve rulings in ledger.
- [ ] Run `npm test -w web`, `npm run build`, `npm run lint`, `npm run check-types`. Separate baseline failures from regressions.
- [ ] Inspect Home/Mastery/Roadmap and companion in browser, desktop and keyboard focus. Do not mutate settings, sessions or child data.
- [ ] Leave reviewed changes in requested feature checkout and write final report; no commits/push/merge/deploy.

## Self-review and rulings

Latest user steering removes original token overhaul, compact navigation, deglossing, Mastery rename, session/settings restyling and roadmap token replacement. Latest steering explicitly reverts the gauge correction. The title fallback remains in scope. The existing dirty checkout is explicitly requested; snapshot baseline instead of pulling, stashing or relocating user work. Independent review uses snapshot diffs rather than commit ranges to preserve that work.
