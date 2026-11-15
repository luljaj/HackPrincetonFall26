import { DEFAULT_FOCUS } from "../../lib/parent/preferences";
import { describe, expect, it } from "vitest";
import { sampleView } from "../../lib/parent/fixtures";
import { runChat, type ChatClient } from "./chat";
import { runTool } from "./tools";

const id = sampleView.progress.sessionId;

describe("parent chat tools", () => {
  it("counts the sample: one incorrect, then correct after help", () => {
    const { data, sessionIds } = runTool("get_skill_progress", { skill: null }, [sampleView]);
    expect(data).toMatchObject([{ questions: 2, correctBeforeHelp: 0, correctAfterHelp: 1, incorrect: 1 }]);
    expect(sessionIds).toEqual([id]);
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
    expect(result.visual).toMatchObject({ headline: "More Math from now on", kind: "none" });
    expect(result.reply).toBe("Done, more Math.");
  });
});
