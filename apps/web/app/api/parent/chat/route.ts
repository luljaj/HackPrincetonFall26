import OpenAI from "openai";
import { setPlan } from "../../../../lib/live/plan";
import { hasParentAccess } from "../../../../lib/parent/access";
import { childName } from "../../../../lib/parent/child";
import { LanguageCodeSchema } from "../../../../lib/play/language-lessons";
import { demoCommand } from "../../../../lib/parent/demo-mode";
import { getParentViewReader } from "../../../../lib/parent/reader";
import { ChatRequestSchema, runChat, type ChatClient } from "../../../../server/parent-chat/chat";
import { readProviderConfig } from "../../../../server/pipeline/config";
import { getPlayStore, getPreferencesStore, getLanguageLessonStore } from "../../../../server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let client: OpenAI | null = null;

export async function POST(request: Request): Promise<Response> {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid chat request." }, { status: 400 });
  const candidate = demoCommand(parsed.data.messages.at(-1)!.content);
  const direct = candidate?.name === "set_language" || parsed.data.demo ? candidate : undefined;
  const play = getPlayStore();
  const lessons = getLanguageLessonStore();
  const learning = {
    currentSkill: () => play.currentSkill(), resetSkills: (ids: readonly string[]) => play.resetSkills(ids), mastery: () => play.mastery(),
    setLanguage: async (language: Parameters<typeof setPlan>[0]["language"]) => {
      const code = LanguageCodeSchema.safeParse(language);
      if (!code.success) return setPlan({ language });
      const available = (await lessons.list(code.data)).filter(row => row.active);
      const lesson = available.find(row => row.lessonId === "demo-addition-1" && row.level < 3) ?? available.sort((a,b) => a.level - b.level)[0];
      return setPlan({ language, ...(lesson ? { lessonId: lesson.lessonId } : {}) });
    },
    lessons,
  };
  // An explicit language command goes straight through the real write tool, even with Demo Mode off.
  if (direct?.name === "set_language") {
    try {
      const noModel: ChatClient = { responses: { create: async () => { throw new Error("Unexpected model call"); } } };
      const result = await runChat(noModel, "direct", parsed.data.messages, [], childName(), new Date(), undefined, undefined, learning, direct);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "The language couldn't be changed. Try again." }, { status: 502 }); }
  }
  let config;
  try {
    config = readProviderConfig();
  } catch {
    return Response.json({ error: "Set OPENAI_API_KEY in apps/web/.env.local to use the chat." }, { status: 503 });
  }
  client ??= new OpenAI({ apiKey: config.apiKey, timeout: 30_000, maxRetries: 1 });
  try {
    // ponytail: loads the 50 newest sessions per message; query per tool once history grows past that
    const prefs = getPreferencesStore();
    const [views, topics, practice, current, mastery] = await Promise.all([getParentViewReader().listParentViews(50), play.topics(), play.practice(), prefs.get(), play.mastery()]);
    const focus = { current: current.focus, set: async (next: typeof current.focus) => {
      const saved = await prefs.set(next);
      if (!(await setPlan({ focus: saved.focus }))) throw new Error("Live updates unavailable");
      return saved;
    } };
    const model = process.env.PARENT_CHAT_MODEL?.trim() || config.lunaModel;
    const result = await runChat(client as unknown as ChatClient, model, parsed.data.messages, views, childName(), new Date(), { topics, practice, mastery }, focus, learning, direct);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The chat couldn't answer that. Try again." }, { status: 502 });
  }
}
