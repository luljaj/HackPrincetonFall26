import OpenAI from "openai";
import { hasParentAccess } from "../../../../lib/parent/access";
import { childName } from "../../../../lib/parent/child";
import { getParentViewReader } from "../../../../lib/parent/reader";
import { ChatRequestSchema, runChat, type ChatClient } from "../../../../server/parent-chat/chat";
import { readProviderConfig } from "../../../../server/pipeline/config";
import { getPlayStore, getPreferencesStore } from "../../../../server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let client: OpenAI | null = null;

export async function POST(request: Request): Promise<Response> {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid chat request." }, { status: 400 });
  let config;
  try {
    config = readProviderConfig();
  } catch {
    return Response.json({ error: "Set OPENAI_API_KEY in apps/web/.env.local to use the chat." }, { status: 503 });
  }
  client ??= new OpenAI({ apiKey: config.apiKey, timeout: 30_000, maxRetries: 1 });
  try {
    // ponytail: loads the 50 newest sessions per message; query per tool once history grows past that
    const play = getPlayStore();
    const prefs = getPreferencesStore();
    const [views, topics, practice, current] = await Promise.all([getParentViewReader().listParentViews(50), play.topics(), play.practice(), prefs.get()]);
    const focus = { current: current.focus, set: (next: typeof current.focus) => prefs.set(next) };
    const model = process.env.PARENT_CHAT_MODEL?.trim() || config.lunaModel;
    const result = await runChat(client as unknown as ChatClient, model, parsed.data.messages, views, childName(), new Date(), { topics, practice }, focus);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The chat couldn't answer that. Try again." }, { status: 502 });
  }
}
