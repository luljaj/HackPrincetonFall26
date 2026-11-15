// Parent chat loop: model → read tools → model, at most MAX_ROUNDS tool rounds (ai-chat-plan.md §3).
import { z } from "zod";
import type { ParentView } from "../../lib/parent/types";
import type { PlayStats } from "./tools";
import { FOCUS_LEVELS, type Focus, type ParentPreferences } from "../../lib/parent/preferences";
import { chatTools, runTool, setFocusTool } from "./tools";

const MAX_ROUNDS = 4;

export const ChatRequestSchema = z.strictObject({
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
export type ChatResult = { reply: string; sessionIds: string[]; visual?: ChatVisual; focusChange?: FocusChange };

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
    ? `You can change the learning focus with set_focus. Current focus: Math ${focus.math}, English ${focus.english}, Science ${focus.science}. When the parent asks to steer learning (e.g. "more addition" means more Math), call set_focus, then confirm in one short sentence. For a focus change, use kind "none" and no items: the panel draws the change itself.`
    : `You can't change settings from this chat. If asked to steer learning (e.g. "teach him more addition"), point the parent to the "Learning focus" controls on this page (Math, English, Science: less / usual / more), then offer what the data shows.`;
  return `You help a parent understand what their child ${child} is learning from interactive cartoons, where the show pauses and the character asks the child questions. Today is ${now.toDateString()}.
Use the tools for every fact. Only state counts, quotes, and dates that appear in tool results. If no tool covers the question, say you don't have that data.
Wording rules: never say "mastered", "score", a percentage, or that the show caused learning. Say "answered correctly before help", "answered correctly after help", "assessed as incorrect", or "unclear". Plain counts are fine. Say so when there is only a little data. If sessions are marked isSample, mention it's sample data.
${steer}
Keep answers short and warm. Plain text only, no markdown (no ** or #).
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
): Promise<ChatResult> {
  const input: unknown[] = [{ role: "system", content: chatInstructions(child, now, focus?.current) }, ...messages];
  const sessionIds = new Set<string>();
  const tools = focus ? [...chatTools, setFocusTool] : chatTools;
  let focusChange: FocusChange | undefined;
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const result = await client.responses.create({
      model,
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
      const extra = focusChange ? { focusChange } : {};
      if (drawn) return { reply: drawn.reply, sessionIds: [...sessionIds], visual: drawn.visual, ...extra };
      return { reply, sessionIds: [...sessionIds], ...extra };
    }
    input.push(...output);
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments ?? "{}");
      } catch {}
      if (call.name === "set_focus" && focus) {
        const before = focusChange?.before ?? focus.current;
        const next = { ...(focusChange?.after ?? focus.current) };
        for (const subject of ["math", "english", "science"] as const) {
          const value = args[subject];
          if (FOCUS_LEVELS.includes(value as never)) next[subject] = value as Focus[typeof subject];
        }
        let data: unknown;
        try {
          const saved = await focus.set(next);
          focusChange = { before, after: saved.focus };
          data = { saved: true, focus: saved.focus };
        } catch {
          data = { saved: false, error: "Couldn't save the focus. Tell the parent to try again." };
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
        continue;
      }
      const { data, sessionIds: touched } = runTool(call.name ?? "", args, views, now, play);
      touched.forEach((id) => sessionIds.add(id));
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
    }
  }
  throw new Error("Chat ran out of tool rounds.");
}
