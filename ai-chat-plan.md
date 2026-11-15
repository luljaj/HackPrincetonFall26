# Parent AI chat plan

A chat bar on the parent view. The parent asks about what the child is learning ("how's Noah doing with addition?") or asks for a change ("teach him more Spanish verbs"). The model answers by calling tools. Every number it gives comes from a tool result, never from its own guess.

## 1. Scope

**In (v1):** a chat bar on `/parent`, one API route, read tools over the data we already store, and one write tool that saves a learning request.

**Out for now:** chat history across visits, voice input, push notifications, chats about more than one child, and enforcing parent controls during playback (see section 6).

## 2. UI

- A fixed bar at the bottom of every `/parent` page (`app/parent/layout.tsx`), with a text input and a send button.
- Sending opens a sheet above the bar with the conversation. Answers stream in.
- Each answer that used data shows small "from" chips (session, skill). Clicking one goes to that session page, so the parent can check the evidence (section 3 of `learning-progress-plan.md`).
- When the box is empty it shows 3 starter prompts: "What did Noah learn today?", "How's his Spanish going?", "What should we practice next?"
- A write action (section 4) shows a confirm card ("Add Spanish verbs to Noah's focus list? Yes / No") before anything is saved.

Files:
- `app/parent/_components/chat-bar.tsx` (client component: input, sheet, streaming)
- `app/api/parent/chat/route.ts`
- `server/parent-chat/tools.ts` (tool definitions plus handlers)
- `server/parent-chat/chat.ts` (the loop: model call → run tools → model call)

## 3. Backend loop

- Same OpenAI client and config as `/api/judge` (`readProviderConfig()`), using the Responses API with function tools and `tool_choice: "auto"`.
- The loop is capped at 4 tool rounds per message, then the model answers with what it has.
- The client sends the conversation each time, so nothing is stored server-side in v1.
- Tool handlers call `getParentViewReader()` and the storage layer. They never send private answer guides or Luna drafts (`interaction_diagnostics`) to the model.
- The system prompt holds the child's name, today's date, the wording rules from section 5, and "only state facts that come from tool results; if no tool covers it, say so".

## 4. Tools

### Read tools (backed by data we already have)

| Tool | Args | Returns | Source |
| --- | --- | --- | --- |
| `list_sessions` | `limit?`, `since?`, `subject?` | Recent sessions: show, episode, objective, date, turns, final status | `listParentViews()` + `showFor()` |
| `get_session` | `sessionId` | Questions, transcripts, assessments, assistance flags, parent summary | `getParentView()` |
| `get_skill_progress` | `subject` or `skill` (e.g. "addition", "Spanish verbs") | Per-skill counts: correct before help, correct after help, incorrect, unclear, last seen | Aggregated from interactions by `objective_id` |
| `get_today` | none | Today's watching: shows, minutes, skills touched, live session if any | `listParentViews()` filtered to today + live session |
| `get_misconceptions` | `subject?` | Repeated `possible_misconception` notes, with the sessions they came from | interactions |
| `suggest_next_step` | `subject?` | The next objective for the weakest recent skill | `nextStepFor()` + skill progress |
| `list_catalog` | `subject?`, `language?` | Skills/objectives the app can teach, plus the shows/episodes that cover them | scene configs + `shows.ts` |

### Write tools (need a new small table, see section 6)

| Tool | Args | Effect |
| --- | --- | --- |
| `add_learning_focus` | `skill`, `language?`, `priority: "more" \| "less"`, `note?` | Saves a parent request, e.g. "more Spanish verbs". Needs confirmation first. |
| `list_learning_focus` | none | Shows what the parent has asked for |
| `remove_learning_focus` | `focusId` | Removes a request. Needs confirmation first. |

Confirmation flow: the model calls the write tool → the route returns `{ needsConfirm, summary }` instead of saving → the UI shows the confirm card → "Yes" re-sends with `confirmed: true` → the route saves it.

## 5. Wording rules (same as the dashboard)

The chat follows the claim table in `learning-progress-plan.md` section 3:
- Never say "mastered", "score", a percentage, or "the show taught him X".
- Say "answered correctly before help" / "after help" / "assessed as incorrect" / "unclear".
- Counts are fine ("3 of 4 addition questions answered correctly before help this week").
- Say clearly when data is thin ("only one session so far").

A test feeds canned tool results into the prompt and checks answers for banned words, like the existing preview-data test.

## 6. Ownership and storage notes

- `learning-progress-plan.md` section 2 says parent-to-kid preference controls belong to the parent-dashboard owner and aren't assumed real. The write tools need that owner's (Andrea's) sign-off before we build them. Until then, v1 ships the read tools only, and requests like "teach more Spanish verbs" get the answer: "I've noted it, but steering the show isn't live yet."
- Storage: a `learning_focus` table (`focus_id`, `learner_id`, `skill`, `language`, `priority`, `note`, `created_at`, `removed_at`). Today that means Drizzle/Postgres in `server/storage/schema.ts`. If we move to Convex, it's one table plus a reactive query, and the Play-mode TV can subscribe to it to pick episodes and pauses. Storage choice is still open.
- Read tools live behind the same parent access check as the dashboard (`lib/parent/access.ts`).

## 7. Example conversations (use cases → tool calls)

**1. "What did Noah learn today?"**
→ `get_today()`
→ "Noah watched 2 Dora episodes (18 min). He worked on counting to 5 and naming colors in Spanish. He counted the apples correctly before help, and got *azul* after one hint."

**2. "What's his progress on addition?"**
→ `get_skill_progress({ skill: "addition" })`
→ "Over the last 2 weeks: 7 addition questions. 4 answered correctly before help, 2 after help, 1 assessed as incorrect (he said 5 for 2+2). The most recent one was correct before help."

**3. "How's his Spanish going?"**
→ `get_skill_progress({ subject: "Spanish" })` + `get_misconceptions({ subject: "Spanish" })`
→ Counts per skill (colors, numbers, greetings). He tends to say *rojo* for orange, seen in 2 sessions.

**4. "Make him learn more Spanish verbs"**
→ `list_catalog({ language: "Spanish" })` (are verb objectives available?) → `add_learning_focus({ skill: "verbs", language: "Spanish", priority: "more" })` → confirm card
→ "Added. Upcoming pauses will lean toward Spanish verbs like *saltar* and *correr*."
*(Read-only v1: "Noted. Steering the show isn't live yet. Dora episodes 2 and 4 have verb pauses if you want to put them on.")*

**5. "Can he learn French instead?"**
→ `list_catalog({ language: "French" })` → `add_learning_focus({ skill: "vocabulary", language: "French", priority: "more" })`
→ Any language works (pronunciation scoring doesn't depend on language), so the answer is yes, after confirmation.

**6. "What is he struggling with?"**
→ `get_misconceptions()` + `get_skill_progress()` for the skills with the most incorrect answers
→ Lists 1–3 patterns, each linked to its session.

**7. "What should we practice at dinner?"**
→ `suggest_next_step()`
→ "Try counting things on the table up to 7. He's solid to 5 and needed help at 6 last time."

**8. "Show me what he said when he got the counting question wrong"**
→ `list_sessions({ subject: "math" })` → `get_session({ sessionId })`
→ Quotes the transcript, the question, and Dora's teaching response, with a link to the session.

**9. "Is he watching anything right now?"**
→ `get_today()` (live session)
→ "Yes, Dora, episode 3. He's at the bridge question right now."

**10. "Stop the Spanish for now, focus on math"**
→ `list_learning_focus()` → `remove_learning_focus(...)` + `add_learning_focus({ skill: "math", priority: "more" })` → one confirm card for both

**11. "Did the show actually teach him counting?"**
→ No tool needed beyond `get_skill_progress`. The model answers within the wording rules: it reports what was answered and how, and says it can't claim the show caused the learning.

## 8. Build order

1. `chat.ts` loop + `list_sessions`, `get_session`, `get_today` against the fixture reader. Test with a canned conversation.
2. `chat-bar.tsx` + route, with streaming. Check it in `/parent` with sample data.
3. `get_skill_progress`, `get_misconceptions`, `suggest_next_step`, `list_catalog`.
4. Wording test (section 5).
5. After the owner signs off: the `learning_focus` table, the write tools, and the confirm card.

## 9. Open questions

- Write tools in v1, or read-only until the parent-controls owner agrees?
- Storage for `learning_focus`: Postgres now, or wait for the Convex move?
- Which model for chat: the same `lunaModel`, or a cheaper one? Latency matters less here than in the kid loop.
