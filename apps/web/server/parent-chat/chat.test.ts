import { createMemoryLanguageLessonStore } from "../storage/language-lessons";
import { DEFAULT_FOCUS } from "../../lib/parent/preferences";
import { describe, expect, it } from "vitest";
import { sampleView } from "../../lib/parent/fixtures";
import { runChat, type ChatClient, type LearningAccess } from "./chat";
import { runTool } from "./tools";
import { createMemoryPlayStore } from "../storage/play";

async function learningFixture() {
  const store = createMemoryPlayStore();
  await store.ingest({ sessionId: "demo-viewing", episodeId: "dora-ep3", events: [
    { type: "session_start", seq: 0, at: 1000, episodeId: "dora-ep3", language: "" },
    { type: "stage", seq: 1, at: 2000, turnId: "demo-turn", spotId: "ep3-55", stage: "entering", question: "How many keys?", skill: "counting" },
    { type: "stage", seq: 2, at: 3000, turnId: "demo-turn", spotId: "ep3-55", stage: "celebrating", tries: 0, nudges: 0, modeled: false },
  ] });
  const languages: string[] = [];
  const learning: LearningAccess = { currentSkill: store.currentSkill, resetSkills: store.resetSkills, mastery: store.mastery,
    setLanguage: async language => { languages.push(language); return true; } };
  return { store, learning, languages };
}

function toolClient(calls: Array<{ name: string; args: object }>) {
  const sent: Array<Record<string, unknown>> = [];
  const client: ChatClient = { responses: { create: async req => {
    sent.push(req);
    return sent.length === 1 ? { output: calls.map((c, i) => ({ type: "function_call", name: c.name, arguments: JSON.stringify(c.args), call_id: String(i) })) }
      : { output: [{ type: "message", content: [{ type: "output_text", text: "Done." }] }] };
  } } };
  return { client, sent };
}

const id = sampleView.progress.sessionId;

describe("parent chat tools", () => {
  it("counts the sample: one incorrect, then correct after help", () => {
    const { data, sessionIds } = runTool("get_skill_progress", { skill: null }, [sampleView]);
    expect(data).toMatchObject([{ questions: 2, correctBeforeHelp: 0, correctAfterHelp: 1, incorrect: 1 }]);
    expect(sessionIds).toEqual([id]);
  });

  it("finds addition and math by the parent's words and gives an actionable next lesson", async () => {
    const { store } = await learningFixture();
    const play = { topics: [], practice: [], mastery: await store.mastery() };
    expect(runTool("get_skill_progress", { skill: "addition" }, [], new Date(), play).data).toMatchObject({ categories: [{ id: "numbers" }] });
    expect(runTool("get_skill_progress", { skill: "math" }, [], new Date(), play).data).toMatchObject({ categories: [{ id: "numbers" }] });
    expect(runTool("suggest_next_step", { skill: "addition" }, [], new Date(), play).data).toMatchObject({ skillId: "add-small-numbers", evidence: { asked: 0 }, preparedQuestion: { lessonId: "demo-addition-1" } });
  });

  it("filters skills and says when there is no data", () => {
    expect(runTool("get_skill_progress", { skill: "spanish verbs" }, [sampleView]).data).toEqual({ note: "No sessions on that skill yet." });
  });

  it("drops sample sessions once a real one exists", () => {
    const real = { ...sampleView, isSample: false, progress: { ...sampleView.progress, sessionId: "real", interactions: [] } };
    expect(runTool("list_sessions", { limit: null }, [real, sampleView]).sessionIds).toEqual(["real"]);
  });

  it("get_today only returns sessions from today", () => {
    const today = new Date(sampleView.startedAt);
    expect(runTool("get_today", {}, [sampleView], today).sessionIds).toEqual([id]);
    expect(runTool("get_today", {}, [sampleView], new Date(today.getTime() + 2 * 86_400_000)).sessionIds).toEqual([]);
  });

  it("get_session never exposes answer guides", () => {
    expect(JSON.stringify(runTool("get_session", { sessionId: id }, [sampleView]).data)).not.toMatch(/answerGuide|answer_guide/);
  });
});

describe("runChat", () => {
  it("resets a category, keeps history, and reads fresh levels in the same tool round", async () => {
    const { store, learning } = await learningFixture();
    const f = toolClient([{ name: "reset_skill", args: { skill: null, category: "numbers", current: null } }, { name: "get_skill_progress", args: { skill: "numbers" } }]);
    const result = await runChat(f.client, "m", [{ role: "user", content: "reset Sam on counting" }], [], "Sam", new Date(), { topics: [], practice: [], mastery: await store.mastery() }, undefined, learning);
    expect(result.masteryReset?.[0]?.target).toBe("Numbers");
    expect(result.visual?.items[0]).toMatchObject({ label: "Numbers", value: "Not yet" });
    expect((await store.get("demo-viewing"))?.turns).toHaveLength(1);
    const input = f.sent[1]?.input as Array<{ output?: string }>;
    const progress = JSON.parse(input.at(-1)!.output!);
    expect(progress.categories[0].skills.every((s: { level: string }) => s.level === "new")).toBe(true);
  });

  it("resolves 'current topic' to the newest saved skill and names it", async () => {
    const { learning } = await learningFixture();
    const f = toolClient([{ name: "reset_skill", args: { skill: null, category: null, current: true } }]);
    const result = await runChat(f.client, "m", [{ role: "user", content: "start him over on the topic he's on" }], [], "Sam", undefined, undefined, undefined, learning);
    expect(result.reply).toContain("Counts up to 10");
    expect(result.masteryReset?.[0]?.skillIds).toEqual(["count-to-10"]);
  });

  it("rejects invented or ambiguous reset ids without writing", async () => {
    const { learning, store } = await learningFixture();
    const f = toolClient([{ name: "reset_skill", args: { skill: "fake-skill", category: null, current: null } }]);
    const before = await store.mastery();
    const result = await runChat(f.client, "m", [{ role: "user", content: "reset" }], [], "Sam", undefined, undefined, undefined, learning);
    expect(result.masteryReset).toBeUndefined();
    expect(await store.mastery()).toEqual(before);
    expect(result.reply).toContain("Choose a valid");
  });

  it("does not reset anything when there is no saved current skill", async () => {
    const { learning, store } = await learningFixture();
    let wrote = false;
    const f = toolClient([{ name: "reset_skill", args: { skill: null, category: null, current: true } }]);
    const before = await store.mastery();
    const result = await runChat(f.client, "m", [{ role: "user", content: "reset the current skill" }], [], "Sam", undefined, undefined, undefined,
      { ...learning, currentSkill: async () => null, resetSkills: async () => { wrote = true; } });
    expect(wrote).toBe(false);
    expect(result.masteryReset).toBeUndefined();
    expect(result.reply).toContain("No saved current skill");
    expect(await store.mastery()).toEqual(before);
  });

  it("switches the real language, and never claims a failed switch succeeded", async () => {
    const { learning, languages } = await learningFixture();
    const f = toolClient([{ name: "set_language", args: { language: "es" } }]);
    const result = await runChat(f.client, "m", [{ role: "user", content: "switch Sam to Spanish" }], [], "Sam", undefined, undefined, undefined, learning);
    expect(languages).toEqual(["es"]);
    expect(result.languageChange).toBe("es");
    expect(result.reply).toContain("selected on the TV");
    const failed = await runChat(toolClient([{ name: "set_language", args: { language: "fr" } }]).client, "m", [{ role: "user", content: "switch" }], [], "Sam", undefined, undefined, undefined, { ...learning, setLanguage: async () => false });
    expect(failed.languageChange).toBeUndefined();
    expect(failed.reply).toContain("unavailable");
  });

  it("demo language commands use the same write path with zero model calls", async () => {
    const { learning, languages } = await learningFixture();
    const noModel: ChatClient = { responses: { create: async () => { throw new Error("Must not call the model"); } } };
    const result = await runChat(noModel, "m", [{ role: "user", content: "switch Sam to Spanish" }], [], "Sam", undefined, undefined, undefined, learning, { name: "set_language", arguments: '{"language":"es"}' });
    expect(result.languageChange).toBe("es");
    expect(languages).toEqual(["es"]);
  });
  it("can explicitly lower, remove and restore a language lesson while preserving Spanish progress", async () => {
    const { learning } = await learningFixture();
    const lessons = createMemoryLanguageLessonStore();
    await lessons.write({ language: "es", lessonId: "demo-addition-1", level: 2 });
    await lessons.write({ language: "hi", lessonId: "demo-addition-1", level: 3 });
    const f = toolClient([{ name: "change_lesson", args: { language: "hi", lessonId: "demo-addition-1", action: "set_level", level: 1 } },
      { name: "change_lesson", args: { language: "hi", lessonId: "demo-addition-1", action: "remove", level: null } },
      { name: "change_lesson", args: { language: "hi", lessonId: "demo-addition-1", action: "restore", level: null } }]);
    const result = await runChat(f.client, "m", [{ role: "user", content: "Lower Hindi three to level 1, remove it, then restore it" }], [], "Sam", undefined, undefined, undefined, { ...learning, lessons });
    expect(result.lessonChanged).toBe(true);
    expect((await lessons.list("hi")).find(row => row.lessonId === "demo-addition-1")).toMatchObject({ level: 1, active: true });
    expect((await lessons.list("es")).find(row => row.lessonId === "demo-addition-1")?.level).toBe(2);
    expect(result.reply).toContain("level 1");
  });

  it("runs a tool round, then returns the text reply with the sessions it used", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: ChatClient = {
      responses: {
        create: async (req) => {
          calls.push(req);
          return calls.length === 1
            ? { output: [{ type: "function_call", name: "get_skill_progress", arguments: '{"skill":null}', call_id: "c1" }] }
            : { output: [{ type: "message", content: [{ type: "output_text", text: "Sam answered correctly after help." }] }] };
        },
      },
    };
    const result = await runChat(client, "m", [{ role: "user", content: "How is counting?" }], [sampleView], "Sam");
    expect(result).toEqual({ reply: "Sam answered correctly after help.", sessionIds: [id] });
    const second = calls[1]!.input as Array<{ type?: string; output?: string }>;
    expect(second.at(-1)).toMatchObject({ type: "function_call_output" });
    expect(second.at(-1)!.output).toContain("correctAfterHelp");
  });

  it("forces a text answer after the round cap", async () => {
    const choices: unknown[] = [];
    const client: ChatClient = {
      responses: {
        create: async (req) => {
          choices.push(req.tool_choice);
          return req.tool_choice === "none"
            ? { output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }] }
            : { output: [{ type: "function_call", name: "get_today", arguments: "{}", call_id: "c" }] };
        },
      },
    };
    expect((await runChat(client, "m", [{ role: "user", content: "hi" }], [sampleView], "Sam")).reply).toBe("done");
    expect(choices.at(-1)).toBe("none");
  });

  it("set_focus saves only the subjects asked for and returns the change to draw", async () => {
    const saved: unknown[] = [];
    const current = { ...DEFAULT_FOCUS, shapes: "less" };
    let n = 0;
    const client: ChatClient = {
      responses: {
        create: async () =>
          ++n === 1
            ? { output: [{ type: "function_call", name: "set_focus", arguments: '{"numbers":"more","words":null,"shapes":null}', call_id: "f" }] }
            : { output: [{ type: "message", content: [{ type: "output_text", text: '{"reply":"Done, more Math.","headline":"More Math from now on","kind":"none","items":[]}' }] }] },
      },
    };
    const focus = {
      current,
      set: async (f: typeof current) => {
        saved.push(f);
        return { focus: f, updatedAt: "2026-11-14T00:00:00.000Z" };
      },
    };
    const result = await runChat(client, "m", [{ role: "user", content: "more addition" }], [sampleView], "Sam", new Date(), undefined, focus as never);
    expect(saved).toEqual([{ ...current, numbers: "more" }]);
    expect(result.focusChange).toEqual({ before: current, after: { ...current, numbers: "more" } });
    expect(result.visual).toMatchObject({ headline: "Learning updated", kind: "none" });
    expect(result.reply).toContain("Numbers: more");
    expect(result.reply).toContain("after the current question");
  });
});
