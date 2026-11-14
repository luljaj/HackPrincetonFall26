import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { exampleScene } from "../scenes/example.scene";
import { MemoryPipelineStore } from "../storage/memory";
import { SessionSnapshotSchema } from "../storage/contract";
import { PipelineError } from "./errors";
import { createSession } from "./session";
import { processTurn } from "./process-turn";
import type { LunaDraft } from "./luna-contract";
import type { LunaContext, PipelineDependencies, PipelineTrace, ProcessTurnInput } from "./types";

const good: LunaDraft = {
  feedbackText: "That's right!", nextQuestion: null, assistanceProvided: false,
  assessment: { answerStatus: "correct", evidence: "Said three.", possibleMisconception: null },
  parentSummary: "Answered the original question correctly.",
};
const wrong: LunaDraft = {
  feedbackText: "There are three red apples. Let's count the green apples.",
  nextQuestion: { text: "How many green apples are on the plate?", answerGuide: "Two; accept 2." },
  assistanceProvided: true,
  assessment: { answerStatus: "incorrect", evidence: "Said four.", possibleMisconception: null },
  parentSummary: "Answered incorrectly; a different counting question is pending.",
};
const unclear: LunaDraft = {
  ...good, feedbackText: "Please try a number.",
  assessment: { answerStatus: "unclear", evidence: "Said that one.", possibleMisconception: null },
};
const audio = () => new File(["synthetic"], "answer.webm", { type: "audio/webm;codecs=opus" });
const code = (expected: string) => (error: unknown) => error instanceof PipelineError && error.code === expected;

async function harness() {
  const store = new MemoryPipelineStore();
  let ticks = 0;
  const contexts: LunaContext[] = [];
  const published: unknown[] = [];
  const traces: PipelineTrace[] = [];
  const logs: string[] = [];
  const calls = { transcription: 0, luna: 0 };
  const state = { transcript: "  three  ", draft: good as unknown };
  const deps: PipelineDependencies = {
    store, createId: randomUUID,
    clock: { now: () => "2026-11-14T12:00:00.000Z", monotonicMs: () => ++ticks },
    promptRevision: "test-v1",
    transcribe: async () => { calls.transcription++; return { transcript: state.transcript, model: "fake-transcriber" }; },
    luna: async (context) => { calls.luna++; contexts.push(context); return { draft: state.draft, model: "fake-luna" }; },
    publish: async (event) => { published.push(event); },
    trace: (trace) => { traces.push(trace); }, log: (event) => { logs.push(event); },
  };
  const session = await createSession({ sceneId: exampleScene.sceneId }, { ...deps, getScene: () => exampleScene });
  const input = (expectedTurnNumber = 0, questionId = session.question.questionId): ProcessTurnInput => ({
    sessionId: session.sessionId, metadata: { interactionId: randomUUID(), expectedTurnNumber, questionId }, audio: audio(),
  });
  return { store, deps, session, input, state, contexts, published, traces, logs, calls };
}

test("session creation snapshots prepared scene, exposes only public question, and runs no providers", async () => {
  const h = await harness();
  assert.deepEqual(h.calls, { transcription: 0, luna: 0 });
  assert.equal("answerGuide" in h.session.question, false);
  const first = (await h.store.loadSession(h.session.sessionId))!;
  first.sceneSnapshot.initialQuestion.answerGuide = "mutated";
  first.activeQuestion!.text = "mutated";
  assert.equal((await h.store.loadSession(h.session.sessionId))!.activeQuestion!.text, exampleScene.initialQuestion.text);
  await assert.rejects(createSession({ sceneId: "missing" }, { ...h.deps, getScene: () => null }), code("INVALID_REQUEST"));
});

test("empty transcript skips Luna, persists not_assessed, and retains the exact question", async () => {
  const h = await harness(); h.state.transcript = " \n ";
  const result = await processTurn(h.input(), h.deps);
  assert.equal(h.calls.luna, 0);
  assert.equal(result.assessment.answerStatus, "not_assessed");
  assert.equal(result.response.text, `I didn't catch that. ${h.session.question.text}`);
  const saved = (await h.store.loadSession(h.session.sessionId))!;
  assert.equal(saved.interactions[0]!.parentSummary, null);
  assert.equal(saved.interactions[0]!.diagnostics.lunaDraft, null);
  assert.equal(saved.interactions[0]!.diagnostics.timings.lunaMs, null);
  assert.deepEqual(saved.activeQuestion, exampleScene.initialQuestion);
});

test("incorrect original, clarification, empty retry, then wrong variant preserves honest evidence and assistance", async () => {
  const h = await harness(); h.state.transcript = "four"; h.state.draft = wrong;
  const first = await processTurn(h.input(), h.deps);
  const variant = first.response.nextQuestion!;
  assert.equal(first.assessment.assistanceBeforeAnswer, false);
  assert.notEqual(variant.questionId, h.session.question.questionId);
  assert.equal(first.response.text.split(variant.text).length - 1, 1);
  h.state.draft = unclear; h.state.transcript = "that one";
  const second = await processTurn(h.input(1, variant.questionId), h.deps);
  assert.equal(second.assessment.assistanceBeforeAnswer, true);
  assert.deepEqual(second.response.nextQuestion, variant);
  h.state.transcript = "";
  await processTurn(h.input(2, variant.questionId), h.deps);
  assert.equal((await h.store.loadSession(h.session.sessionId))!.latestParentSummary, unclear.parentSummary);
  h.state.transcript = "nine";
  h.state.draft = { ...wrong, nextQuestion: null, feedbackText: "There are two green apples. Thanks for counting with me." };
  const last = await processTurn(h.input(3, variant.questionId), h.deps);
  assert.equal(last.assessment.answerStatus, "incorrect");
  assert.equal(last.response.nextQuestion, null);
  const saved = (await h.store.loadSession(h.session.sessionId))!;
  assert.equal(saved.interactions[0]!.assessment.answerStatus, "incorrect");
  assert.equal(saved.interactions[3]!.questionId, variant.questionId);
  assert.equal(saved.interactions[3]!.answerGuide, wrong.nextQuestion!.answerGuide);
  assert.equal(h.contexts.at(-1)!.history.length, 3);
  assert.equal(h.contexts.at(-1)!.questionKind, "variant");
  assert.equal(h.contexts.at(-1)!.history[0]!.transcript, "four");
  assert.equal(SessionSnapshotSchema.safeParse(saved).success, true);
  await assert.rejects(processTurn(h.input(4, variant.questionId), h.deps), code("TURN_CONFLICT"));
});

test("clarifications of original do not consume the variant allowance; off-topic remains teaching", async () => {
  const h = await harness(); h.state.draft = unclear;
  await processTurn(h.input(), h.deps);
  h.state.draft = { ...unclear, assessment: { ...unclear.assessment, answerStatus: "off_topic" } };
  const offTopic = await processTurn(h.input(1), h.deps);
  assert.equal(offTopic.response.type, "teaching");
  assert.equal(offTopic.assessment.answerStatus, "off_topic");
  assert.equal(offTopic.response.nextQuestion!.questionId, h.session.question.questionId);
  h.state.draft = wrong;
  const variant = await processTurn(h.input(2), h.deps);
  assert.notEqual(variant.response.nextQuestion!.questionId, h.session.question.questionId);
});

test("completed replay precedes stale metadata checks and does no provider work or write", async () => {
  const h = await harness(); const input = h.input();
  const first = await processTurn(input, h.deps);
  const second = await processTurn({ ...input, metadata: { ...input.metadata, expectedTurnNumber: 999, questionId: "stale" } }, h.deps);
  assert.deepEqual(first, second);
  assert.deepEqual(h.calls, { transcription: 1, luna: 1 });
  assert.equal(h.published.length, 1);
  assert.equal((await h.store.loadSession(h.session.sessionId))!.interactions.length, 1);
});

test("same interaction concurrent requests return exact committed result and publish once", async () => {
  const h = await harness(); const input = h.input();
  const results = await Promise.all([processTurn(input, h.deps), processTurn(input, h.deps)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(h.published.length, 1);
  assert.equal((await h.store.loadSession(h.session.sessionId))!.interactions.length, 1);
  assert.equal(h.traces.filter((trace) => trace.replayed).length, 1);
});

test("distinct concurrent submissions cannot both commit", async () => {
  const h = await harness();
  const results = await Promise.allSettled([processTurn(h.input(), h.deps), processTurn(h.input(), h.deps)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(code("TURN_CONFLICT")(rejected.reason));
  assert.equal(h.published.length, 1);
});

test("duplicate IDs are scoped to session and snapshots/commit results are isolated", async () => {
  const h = await harness(); const firstInput = h.input();
  await processTurn(firstInput, h.deps);
  const other = await createSession({ sceneId: exampleScene.sceneId }, { ...h.deps, getScene: () => exampleScene });
  await processTurn({ ...firstInput, sessionId: other.sessionId }, h.deps);
  assert.deepEqual(h.calls, { transcription: 2, luna: 2 });
  const saved = (await h.store.loadSession(h.session.sessionId))!;
  const record = saved.interactions[0]!;
  const replay = await h.store.commitTurn({ sessionId: saved.sessionId, expectedTurnNumber: 999, interaction: record });
  replay.record.responseText = "mutated";
  saved.interactions[0]!.turnResponse.response.text = "mutated";
  assert.equal((await h.store.loadSession(saved.sessionId))!.interactions[0]!.responseText, good.feedbackText);
});

for (const [name, draft] of [
  ["missing variant", { ...wrong, nextQuestion: null }],
  ["identical variant", { ...wrong, nextQuestion: { ...wrong.nextQuestion!, text: exampleScene.initialQuestion.text.toUpperCase() } }],
  ["variant on correct", { ...good, nextQuestion: wrong.nextQuestion }],
  ["variant on unclear", { ...unclear, nextQuestion: wrong.nextQuestion }],
  ["duplicated question", { ...wrong, feedbackText: `${wrong.feedbackText} ${wrong.nextQuestion!.text}` }],
  ["invalid shape", { ...good, unexpected: "private" }],
] as const) {
  test(`rejects ${name} before commit`, async () => {
    const h = await harness(); h.state.draft = draft;
    await assert.rejects(processTurn(h.input(), h.deps), code("INVALID_MODEL_OUTPUT"));
    assert.equal((await h.store.loadSession(h.session.sessionId))!.turnNumber, 0);
    assert.equal(h.published.length, 0);
  });
}

test("assessed variant rejects a third question", async () => {
  const h = await harness(); h.state.draft = wrong;
  const first = await processTurn(h.input(), h.deps);
  await assert.rejects(processTurn(h.input(1, first.response.nextQuestion!.questionId), h.deps), code("INVALID_MODEL_OUTPUT"));
});

test("correct variant finishes, and prepared assistance is attributed before the first answer", async () => {
  const h = await harness();
  const assisted = await createSession({ sceneId: exampleScene.sceneId }, {
    ...h.deps, getScene: () => ({ ...exampleScene, assistanceAlreadyProvided: true }),
  });
  const prepared = await processTurn({ ...h.input(), sessionId: assisted.sessionId }, h.deps);
  assert.equal(prepared.assessment.assistanceBeforeAnswer, true);
  assert.equal(prepared.response.nextQuestion, null);
  h.state.draft = wrong;
  const first = await processTurn(h.input(), h.deps);
  h.state.draft = good;
  const last = await processTurn(h.input(1, first.response.nextQuestion!.questionId), h.deps);
  assert.equal(last.response.nextQuestion, null);
  assert.equal(last.assessment.answerStatus, "correct");
  assert.equal(last.assessment.assistanceBeforeAnswer, true);
});

test("invalid audio/IDs fail before provider calls; unknown session and stale question fail", async () => {
  const h = await harness(); const input = h.input();
  for (const [file, expected] of [
    [new File([], "a.wav", { type: "audio/wav" }), "INVALID_REQUEST"],
    [new File(["x"], "a.mp3", { type: "audio/mpeg" }), "UNSUPPORTED_AUDIO"],
    [new File(["x"], "a.wav", { type: "audio/webm" }), "UNSUPPORTED_AUDIO"],
    [new File([new Uint8Array(3 * 1024 * 1024 + 1)], "a.wav", { type: "audio/wav" }), "AUDIO_TOO_LARGE"],
  ] as const) await assert.rejects(processTurn({ ...input, audio: file }, h.deps), code(expected));
  await assert.rejects(processTurn({ ...input, sessionId: "bad" }, h.deps), code("INVALID_REQUEST"));
  await assert.rejects(processTurn({ ...input, sessionId: randomUUID() }, h.deps), code("SESSION_NOT_FOUND"));
  await assert.rejects(processTurn(h.input(0, "unknown"), h.deps), code("TURN_CONFLICT"));
  assert.deepEqual(h.calls, { transcription: 0, luna: 0 });
});

test("provider and persistence failures use sanitized public errors and never return success", async () => {
  const h = await harness();
  h.deps.transcribe = async () => { throw new Error("secret-provider-key"); };
  await assert.rejects(processTurn(h.input(), h.deps), (error: unknown) => code("PROVIDER_ERROR")(error) && !String(error).includes("secret"));
  h.deps.transcribe = async () => { throw new PipelineError("UNSUPPORTED_AUDIO"); };
  await assert.rejects(processTurn(h.input(), h.deps), code("UNSUPPORTED_AUDIO"));
  const fresh = await harness();
  fresh.deps.store = { ...fresh.store, createSession: fresh.store.createSession.bind(fresh.store), loadSession: fresh.store.loadSession.bind(fresh.store), commitTurn: async () => { throw new Error("database credentials"); } };
  await assert.rejects(processTurn(fresh.input(), fresh.deps), code("PERSISTENCE_ERROR"));
  assert.equal(fresh.published.length, 0);
});

test("postcommit notification/trace failures cannot undo commit, and callbacks contain no audio", async () => {
  const h = await harness();
  h.deps.publish = async (event) => { assert.deepEqual(Object.keys(event).sort(), ["interactionId", "sessionId", "turnNumber"]); throw new Error("secret"); };
  h.deps.trace = (trace) => { assert.equal("audio" in trace.record, false); assert.ok(trace.totalMs >= trace.persistenceMs); throw new Error("secret"); };
  const response = await processTurn(h.input(), h.deps);
  assert.deepEqual(h.logs, ["publisher_failed", "trace_failed"]);
  assert.equal((await h.store.loadSession(h.session.sessionId))!.turnNumber, 1);
  for (const privateKey of ["answerGuide", "parentSummary", "diagnostics", "lunaDraft", "transcript"]) assert.equal(JSON.stringify(response).includes(privateKey), false);
});

test("transcript fidelity and timing trace preserve data without mutating persisted diagnostics", async () => {
  const h = await harness(); h.state.transcript = "  three   apples\nplease  ";
  await processTurn(h.input(), h.deps);
  const saved = (await h.store.loadSession(h.session.sessionId))!;
  assert.equal(saved.interactions[0]!.transcript, "three   apples\nplease");
  const timings = saved.interactions[0]!.diagnostics.timings;
  assert.ok(timings.transcriptionMs! > 0 && timings.lunaMs! > 0 && timings.processingBeforeCommitMs > 0);
  assert.ok(h.traces[0]!.persistenceMs > 0);
  h.traces[0]!.record.answerGuide = "mutated";
  assert.equal((await h.store.loadSession(h.session.sessionId))!.interactions[0]!.answerGuide, exampleScene.initialQuestion.answerGuide);
});
