// Parent chat loop: model → read tools → model, at most MAX_ROUNDS tool rounds (ai-chat-plan.md §3).
import { lunaServiceTier } from "../pipeline/config";
import { z } from "zod";
import type { ParentView } from "../../lib/parent/types";
import type { PlayStats } from "./tools";
import { FOCUS_LEVELS, PLAN_LANGUAGES, SUBJECTS, type Focus, type ParentPreferences } from "../../lib/parent/preferences";
import { CATEGORIES, type Mastery } from "../../lib/play/mastery";
import { LanguageCodeSchema, LessonKeySchema, LessonLevelSchema, LESSON_LEVELS } from "../../lib/play/language-lessons";
import type { LanguageLessonStore } from "../storage/language-lessons";
import { listLanguageLessonsTool, changeLessonTool, chatTools, runTool, resetSkillTool, setFocusTool, setLanguageTool } from "./tools";

const MAX_ROUNDS = 4;

export const ChatRequestSchema = z.strictObject({
  demo: z.boolean().optional(),
  messages: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30),
});
export type ChatMessage = z.infer<typeof ChatRequestSchema>["messages"][number];
// The panel draws the answer instead of printing it: a headline plus a few rows,
// tiles or steps. `reply` stays as the plain-text version (history, screen readers).
export type VisualTone = "good" | "help" | "miss" | "neutral";
export type ChatVisual = {
  headline: string;
  kind: "rows" | "stats" | "steps" | "none";
  items: { label: string; value: string; detail: string; tone: VisualTone }[];
};
export type FocusChange = { before: Focus; after: Focus };
export type MasteryChange = { target: string; skillIds: string[] };
export type LearningAccess = { currentSkill: () => Promise<string | null>; resetSkills: (ids: readonly string[]) => Promise<void>; mastery: () => Promise<Mastery>; setLanguage: (language: (typeof PLAN_LANGUAGES)[number]) => Promise<boolean>; lessons?: LanguageLessonStore };
export type DirectCommand = { name: "reset_skill" | "set_language"; arguments: string };
export type ChatResult = { reply: string; sessionIds: string[]; visual?: ChatVisual; focusChange?: FocusChange; masteryReset?: MasteryChange[]; languageChange?: string; lessonChanged?: boolean };

const ResetArgs = z.strictObject({
  skill: z.enum(CATEGORIES.flatMap(c => c.skills.map(s => s.id))).nullable(),
  category: z.enum(CATEGORIES.map(c => c.id)).nullable(),
  current: z.literal(true).nullable(),
}).refine(v => [v.skill, v.category, v.current].filter(x => x !== null).length === 1, "Choose exactly one reset target.");
const LessonChangeArgs = LessonKeySchema.extend({ action: z.enum(["set_level", "remove", "restore", "use_recorded"]), level: LessonLevelSchema.nullable() })
  .refine(v => v.action === "set_level" ? v.level !== null : v.level === null, "Only set_level takes a level.");
const LanguageArgs = z.strictObject({ language: z.enum(PLAN_LANGUAGES) });
const LANGUAGE_NAMES: Record<string, string> = { "": "English", es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };
const UNAVAILABLE_LANGUAGE = "Live language changes are unavailable";
const NO_CURRENT_SKILL = "No saved current skill was found; name a skill or category";

/** Lets the chat read and change the learning focus. Without it the chat is read-only. */
export type FocusAccess = { current: Focus; set: (focus: Focus) => Promise<ParentPreferences> };

const VisualSchema = z.object({
  reply: z.string().trim().min(1),
  headline: z.string().trim().min(1).max(120),
  kind: z.enum(["rows", "stats", "steps", "none"]),
  items: z
    .array(
      z.object({
        label: z.string().max(80),
        value: z.string().max(60),
        detail: z.string().max(200),
        tone: z.enum(["good", "help", "miss", "neutral"]),
      }),
    )
    .max(8),
});

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value", "detail", "tone"],
  properties: {
    label: { type: "string", description: "Short row name, e.g. a skill, a day, or a step." },
    value: { type: "string", description: "Short figure or status, e.g. '3 of 4' or 'After help'. Empty if none." },
    detail: { type: "string", description: "One short clause of context. Empty if none." },
    tone: { type: "string", enum: ["good", "help", "miss", "neutral"] },
  },
};

const REPLY_FORMAT = {
  type: "json_schema",
  name: "parent_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "headline", "kind", "items"],
    properties: {
      reply: { type: "string", description: "The full answer as 1 to 3 plain sentences." },
      headline: { type: "string", description: "The answer in 3 to 8 words, sentence case, no period." },
      kind: {
        type: "string",
        enum: ["rows", "stats", "steps", "none"],
        description: "rows: a list of sessions/skills/questions. stats: 2 to 4 counts. steps: a short plan. none: nothing to lay out.",
      },
      items: { type: "array", items: ITEM_SCHEMA, description: "0 to 6 items for the chosen kind." },
    },
  },
};

function parseVisual(text: string): { reply: string; visual: ChatVisual } | null {
  try {
    const parsed = VisualSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const { reply, headline, kind, items } = parsed.data;
    return { reply, visual: { headline, kind: items.length ? kind : "none", items: items.slice(0, 6) } };
  } catch {
    return null;
  }
}

type OutputItem = { type: string; name?: string; arguments?: string; call_id?: string; content?: Array<{ type: string; text?: string }> };
export type ChatClient = {
  responses: { create: (input: Record<string, unknown>) => Promise<{ output?: OutputItem[] }> };
};

export function chatInstructions(child: string, now: Date, focus?: Focus): string {
  const steer = focus
    ? `You can change the learning focus with set_focus. Current focus: ${SUBJECTS.map((s) => `${s.name} ${focus[s.id] ?? "usual"}`).join(", ")}. When the parent asks to steer learning (e.g. "more counting" means more Numbers), call set_focus, then confirm in one short sentence. For a focus change, use kind "none" and no items: the panel draws the change itself.`
    : `You can't change settings from this chat. If asked to steer learning (e.g. "teach him more addition"), point the parent to the "Learning focus" controls on this page (${SUBJECTS.map((s) => s.name).join(", ")}: less / usual / more), then offer what the data shows.`;
  return `You help a parent understand what their child ${child} is learning from interactive cartoons, where the show pauses and the character asks the child questions. Today is ${now.toDateString()}.
Use the tools for every fact. Only state counts, quotes, and dates that appear in tool results. If no tool covers the question, say you don't have that data.
For 'why did he miss it?', read the latest relevant session and quote what the child actually said; distinguish a possible misunderstanding from a known cause. Never infer attention, motivation, or ability from one answer. Offer one short next step supported by that evidence.
For unrelated requests, briefly say you help with ${child}'s learning and offer a relevant action; do not invent a data-based answer.
Use list_language_lessons to read per-lesson levels; change_lesson allows explicit create/update/lower/remove/restore requests. Parent-set levels are adjustments, not evidence of what the child independently answered. Never edit levels merely because the parent asks how the child is doing.
set_language changes the TV's learning language; set_focus only changes how often categories appear. The show's Spanish category is not a language setting. Never claim a switch or reset succeeded unless its tool says saved=true. reset_skill keeps history but starts the chosen skill/category at Not yet; current=true resolves the skill of the newest saved pause and the reply must name it. After resetting, get_skill_progress uses current reset-aware mastery; session details remain historical. If a write tool isn't available, say that action is unavailable.
Wording rules: never say "mastered", "score", a percentage, or that the show caused learning. Say "answered correctly before help", "answered correctly after help", "assessed as incorrect", or "unclear". Plain counts are fine. Say so when there is only a little data. If sessions are marked isSample, mention it's sample data.
${steer}
Make the answer useful immediately: lead with the answer or saved change, give one specific piece of evidence, then ONE concrete next action when useful. Do not dump every subject or repeat widget rows in prose.
For "how is he doing?", use get_skill_progress, and read a relevant session when describing an answer. For "what should we practise?" or "how can I help?", call suggest_next_step and give its concrete activity. With no data, say "not assessed yet" and suggest starter practice; never call that a struggle. For Hindi/Spanish progress, also read list_language_lessons so parent-set levels are distinguished from observed pronunciation.
If a parent explicitly asks for an available change, do it and explain when Dora will apply it. Do not ask whether to do the thing they just requested. If the request could refer to several different lessons, ask one short question naming the choices rather than editing all of them.
An empty transcript means speech wasn't saved. It does not prove the child was silent. A wrong answer alone does not prove why they were wrong. Refer to Mastery as the app's saved skill label only, not a broad claim about the child's ability.
Keep answers to 2 or 3 short sentences, usually under 70 words. Plain text only, no markdown (no ** or #).
Your answer is drawn as a small visual, not printed: give a headline, a 1 to 3 sentence reply, and lay the facts out as items. Tone: good = answered correctly before help, help = correct after help, miss = assessed as incorrect, neutral = everything else. Items repeat no sentence from the reply.`;
}

export async function runChat(
  client: ChatClient,
  model: string,
  messages: ChatMessage[],
  views: readonly ParentView[],
  child: string,
  now = new Date(),
  play: PlayStats = { topics: [], practice: [] },
  focus?: FocusAccess,
  learning?: LearningAccess,
  direct?: DirectCommand,
): Promise<ChatResult> {
  const input: unknown[] = [{ role: "system", content: chatInstructions(child, now, focus?.current) }, ...messages];
  const sessionIds = new Set<string>();
  const tools = [...chatTools, ...(focus ? [setFocusTool] : []), ...(learning ? [resetSkillTool, setLanguageTool] : []), ...(learning?.lessons ? [listLanguageLessonsTool, changeLessonTool] : [])];
  let focusChange: FocusChange | undefined;
  let lessonChanged = false;
  let activePlay = play;
  const masteryReset: MasteryChange[] = [];
  let languageChange: string | undefined;
  const receipts: string[] = [];
  const lessonItems: ChatVisual["items"] = [];
  const failures: string[] = [];
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const result: { output?: OutputItem[] } = direct ? { output: round === 0
      ? [{ type: "function_call", name: direct.name, arguments: direct.arguments, call_id: "demo-action" }]
      : [{ type: "message", content: [{ type: "output_text", text: "Done." }] }] } : await client.responses.create({
      model,
      service_tier: lunaServiceTier(),
      store: false,
      include: ["reasoning.encrypted_content"], // store:false needs reasoning items passed back between rounds
      max_output_tokens: 1200,
      tools,
      tool_choice: round === MAX_ROUNDS ? "none" : "auto",
      text: { format: REPLY_FORMAT },
      input,
    });
    const output = result.output ?? [];
    const calls = output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      const reply = output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .map((c) => c.text ?? "")
        .join("")
        .trim();
      if (!reply) throw new Error("Empty chat reply.");
      const drawn = parseVisual(reply);
      const extra = { ...(lessonChanged ? { lessonChanged: true } : {}), ...(focusChange ? { focusChange } : {}), ...(masteryReset.length ? { masteryReset } : {}), ...(languageChange !== undefined ? { languageChange } : {}) };
      if (receipts.length || failures.length) {
        const items: ChatVisual["items"] = [
          ...lessonItems.slice(-6),
          ...masteryReset.map(r => ({ label: r.target, value: "Not yet", detail: "Earlier answers remain in history.", tone: "neutral" as const })),
          ...(languageChange !== undefined ? [{ label: "Learning language", value: LANGUAGE_NAMES[languageChange] ?? languageChange, detail: "Updates live; practice follows the current question.", tone: "neutral" as const }] : []),
        ];
        return { reply: [...receipts, ...failures].join("; ") + ".", sessionIds: [...sessionIds], visual: { headline: failures.length ? "Some changes weren't applied" : "Learning updated", kind: items.length ? "rows" : "none", items }, ...extra };
      }
      if (drawn) return { reply: drawn.reply, sessionIds: [...sessionIds], visual: drawn.visual, ...extra };
      return { reply, sessionIds: [...sessionIds], ...extra };
    }
    input.push(...output);
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments ?? "{}");
      } catch {}
      if ((call.name === "list_language_lessons" || call.name === "change_lesson") && learning?.lessons) {
        let data: unknown;
        try {
          if (call.name === "list_language_lessons") {
            const language = LanguageCodeSchema.parse(args.language);
            data = await learning.lessons.list(language);
          } else {
            const change = LessonChangeArgs.parse(args);
            if (change.action === "use_recorded") await learning.lessons.deleteOverride(change.language, change.lessonId);
            else await learning.lessons.write({ language: change.language, lessonId: change.lessonId,
              ...(change.action === "set_level" && change.level !== null ? { level: change.level } : { active: change.action === "restore" }) });
            const lesson = (await learning.lessons.list(change.language)).find(row => row.lessonId === change.lessonId);
            if (!lesson) throw new Error("Unknown lesson");
            lessonChanged = true;
            lessonItems.push({ label: `${LANGUAGE_NAMES[change.language]} · ${lesson.english}`, value: lesson.active ? `${lesson.level} · ${LESSON_LEVELS[lesson.level]}` : "Removed", detail: change.action === "remove" ? "Hidden from practice; its level and earlier evidence are saved." : lesson.source === "parent" ? "Parent-set level; earlier evidence is unchanged." : "Uses saved practice evidence.", tone: "neutral" });
            receipts.push(change.action === "remove" ? `${lesson.word} was removed from practice; its progress is saved`
              : change.action === "restore" ? `${lesson.word} is back in practice at level ${lesson.level}`
              : change.action === "use_recorded" ? `${lesson.word} now uses recorded progress`
              : `${lesson.word} is set to level ${lesson.level} (${LESSON_LEVELS[lesson.level]}) by the parent`);
            data = { saved: true, lesson };
          }
        } catch { const error = "That lesson change couldn't be completed; choose a supported language, prepared lesson and level"; failures.push(error); data = { saved: false, error }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
        continue;
      }
      if ((call.name === "reset_skill" || call.name === "set_language") && learning) {
        let data: unknown;
        try {
          if (call.name === "set_language") {
            const { language } = LanguageArgs.parse(args);
            if (!(await learning.setLanguage(language))) throw new Error(UNAVAILABLE_LANGUAGE);
            languageChange = language;
            receipts.push(`${LANGUAGE_NAMES[language]} is selected on the TV; Dora will finish the current question before starting its practice`);
            data = { saved: true, language };
          } else {
            const target = ResetArgs.parse(args);
            const category = CATEGORIES.find(c => c.id === target.category);
            const current = target.current ? await learning.currentSkill() : null;
            const skill = CATEGORIES.flatMap(c => c.skills).find(s => s.id === (target.skill ?? current));
            if (!category && !skill) throw new Error(NO_CURRENT_SKILL);
            const ids = category ? category.skills.map(s => s.id) : skill ? [skill.id] : [];
            const label = category?.name ?? skill!.name;
            await learning.resetSkills(ids);
            masteryReset.push({ target: label, skillIds: ids });
            activePlay = { ...activePlay, mastery: await learning.mastery() };
            receipts.push(`${label} is reset to Not yet for ${child}`);
            data = { saved: true, target: label, skillIds: ids, level: "new" };
          }
        } catch (error) {
          const message = error instanceof z.ZodError ? "Choose a valid skill/category or supported language"
            : error instanceof Error && [UNAVAILABLE_LANGUAGE, NO_CURRENT_SKILL].includes(error.message)
              ? error.message : "The learning change couldn't be saved; please try again";
          failures.push(message);
          data = { saved: false, error: message };
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
        continue;
      }
      if (call.name === "set_focus" && focus) {
        const before = focusChange?.before ?? focus.current;
        const next = { ...(focusChange?.after ?? focus.current) };
        for (const { id } of SUBJECTS) {
          const value = args[id];
          if (FOCUS_LEVELS.includes(value as never)) next[id] = value as Focus[string];
        }
        let data: unknown;
        try {
          const saved = await focus.set(next);
          focusChange = { before, after: saved.focus };
          const changed = SUBJECTS.filter(subject => before[subject.id] !== saved.focus[subject.id]);
          receipts.push(changed.length ? `${changed.map(subject => `${subject.name}: ${saved.focus[subject.id]}`).join(", ")}; Dora applies the new focus after the current question`
            : "The requested focus is already set; Dora will continue using it");
          data = { saved: true, focus: saved.focus };
        } catch {
          const error = "Couldn't apply the focus to the TV; please try again";
          failures.push(error);
          data = { saved: false, error };
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
        continue;
      }
      const { data, sessionIds: touched } = runTool(call.name ?? "", args, views, now, activePlay);
      touched.forEach((id) => sessionIds.add(id));
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
    }
  }
  throw new Error("Chat ran out of tool rounds.");
}
