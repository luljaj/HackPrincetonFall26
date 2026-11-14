import assert from "node:assert/strict";
import test from "node:test";
import { judgeTurn, JudgeRequestSchema, type JudgeClient } from "./judge";

const req = JudgeRequestSchema.parse({
  question: "What do we put on to stay safe?", answerGuide: "seatbelt", said: "a helmet",
  outcomes: { correct: "celebrate", wrong: "give a clue", unclear: "ask again" },
});
const fake = (output: Array<{ type: string; name?: string; arguments?: string }>) => {
  let sent: Record<string, unknown> = {};
  const client: JudgeClient = { responses: { create: async (input) => ((sent = input), { output }) } };
  return { client, sent: () => sent };
};

test("the tool name becomes the event and its arguments the line", async () => {
  const f = fake([{ type: "reasoning" }, { type: "function_call", name: "wrong", arguments: '{"say":"Hmm, it goes click!","skill":"objects"}' }]);
  assert.deepEqual(await judgeTurn(f.client, "m", req), { event: "wrong", say: "Hmm, it goes click!", skill: "objects" });
  const tools = f.sent().tools as Array<{ name: string; description: string }>;
  assert.deepEqual(tools.map((t) => t.name), ["correct", "wrong", "unclear"]);
  assert.match(tools[1]!.description, /give a clue/);
  assert.equal(f.sent().tool_choice, "required");
});

test("no tool call, an unknown tool, or bad arguments are rejected", async () => {
  await assert.rejects(judgeTurn(fake([{ type: "message" }]).client, "m", req));
  await assert.rejects(judgeTurn(fake([{ type: "function_call", name: "skip", arguments: '{"say":"x","skill":"words"}' }]).client, "m", req));
  await assert.rejects(judgeTurn(fake([{ type: "function_call", name: "correct", arguments: '{"say":"","skill":"words"}' }]).client, "m", req));
});

test("a pronunciation verdict forces the tool, so Luna only writes the line", async () => {
  const pron = JudgeRequestSchema.parse({ ...req, said: "aliba", pronunciation: { verdict: "close", expected: "r" } });
  const f = fake([{ type: "function_call", name: "correct", arguments: '{"say":"¡Sí! Now roll it: arrrriba!","skill":"spanish"}' }]);
  assert.equal((await judgeTurn(f.client, "m", pron)).event, "correct");
  assert.deepEqual(f.sent().tool_choice, { type: "function", name: "correct" });
  const retry = JudgeRequestSchema.parse({ ...req, pronunciation: { verdict: "retry", expected: null } });
  await assert.rejects(judgeTurn(fake([{ type: "function_call", name: "correct", arguments: '{"say":"x","skill":"words"}' }]).client, "m", retry));
});
