// Parent chat loop: model → read tools → model, at most MAX_ROUNDS tool rounds (ai-chat-plan.md §3).
import { z } from "zod";
import type { ParentView } from "../../lib/parent/types";
import type { PlayStats } from "./tools";
import { chatTools, runTool } from "./tools";

const MAX_ROUNDS = 4;

export const ChatRequestSchema = z.strictObject({
  messages: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30),
});
export type ChatMessage = z.infer<typeof ChatRequestSchema>["messages"][number];
export type ChatResult = { reply: string; sessionIds: string[] };

type OutputItem = { type: string; name?: string; arguments?: string; call_id?: string; content?: Array<{ type: string; text?: string }> };
export type ChatClient = {
  responses: { create: (input: Record<string, unknown>) => Promise<{ output?: OutputItem[] }> };
};

export function chatInstructions(child: string, now: Date): string {
  return `You help a parent understand what their child ${child} is learning from interactive cartoons, where the show pauses and the character asks the child questions. Today is ${now.toDateString()}.
Use the tools for every fact. Only state counts, quotes, and dates that appear in tool results. If no tool covers the question, say you don't have that data.
Wording rules: never say "mastered", "score", a percentage, or that the show caused learning. Say "answered correctly before help", "answered correctly after help", "assessed as incorrect", or "unclear". Plain counts are fine. Say so when there is only a little data. If sessions are marked isSample, mention it's sample data.
You can't change settings from this chat. If asked to steer learning (e.g. "teach him more addition"), point the parent to the "Learning focus" controls on this page (Math, English, Science: less / usual / more), then offer what the data shows.
Keep answers short and warm: 1 to 4 sentences, or a short list. Plain text only, no markdown (no ** or #).`;
}

export async function runChat(
  client: ChatClient,
  model: string,
  messages: ChatMessage[],
  views: readonly ParentView[],
  child: string,
  now = new Date(),
  play: PlayStats = { topics: [], practice: [] },
): Promise<ChatResult> {
  const input: unknown[] = [{ role: "system", content: chatInstructions(child, now) }, ...messages];
  const sessionIds = new Set<string>();
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const result = await client.responses.create({
      model,
      store: false,
      include: ["reasoning.encrypted_content"], // store:false needs reasoning items passed back between rounds
      max_output_tokens: 800,
      tools: chatTools,
      tool_choice: round === MAX_ROUNDS ? "none" : "auto",
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
      return { reply, sessionIds: [...sessionIds] };
    }
    input.push(...output);
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments ?? "{}");
      } catch {}
      const { data, sessionIds: touched } = runTool(call.name ?? "", args, views, now, play);
      touched.forEach((id) => sessionIds.add(id));
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) });
    }
  }
  throw new Error("Chat ran out of tool rounds.");
}
