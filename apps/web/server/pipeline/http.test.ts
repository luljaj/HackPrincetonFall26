import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createHttpHandlers, validateContainer } from "./http";
import { createPipelineRuntime, debugEnabled, selectStore } from "./runtime-core";
import { PipelineError } from "./errors";
import { MAX_AUDIO_BYTES } from "./audio";

const env = { NODE_ENV: "development", PIPELINE_DEBUG: "true" };
const audio = () => new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], "answer.webm", { type: "audio/webm;codecs=opus" });
const jsonRequest = (body: unknown) => new Request("http://localhost/api/learning/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function harness() {
  let calls = 0;
  let initialized = 0;
  const runtime = createPipelineRuntime(env, () => {
    initialized++;
    return { transcribe: async () => { calls++; return { transcript: "", model: "fake" }; }, luna: async () => { throw new Error("must skip"); } };
  });
  const handlers = createHttpHandlers(() => runtime, env);
  const response = await handlers.create(jsonRequest({ sceneId: "demo-scene" }));
  assert.equal(response.status, 201);
  const session = await response.json();
  const metadata = { interactionId: randomUUID(), questionId: session.question.questionId, expectedTurnNumber: "0" };
  function form() {
    const data = new FormData();
    for (const [key, value] of Object.entries(metadata)) data.append(key, value);
    data.append("audio", audio());
    return data;
  }
  const turn = (data = form(), sessionId = session.sessionId) => handlers.turn(new Request("http://localhost/turns", { method: "POST", body: data }), sessionId);
  return { runtime, handlers, session, metadata, form, turn, calls: () => calls, initialized: () => initialized };
}

test("setup is lazy, strict, persisted; HTTP turn and exact replay share canonical readback", async () => {
  const h = await harness();
  assert.equal(h.initialized(), 0);
  assert.equal((await h.handlers.create(jsonRequest({ sceneId: "demo-scene", transcript: "three" }))).status, 400);
  assert.equal((await h.handlers.create(jsonRequest({ sceneId: "missing" }))).status, 400);
  const first = await h.turn(); assert.equal(first.status, 200);
  const result = await first.json();
  const retry = await h.turn(); assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), result);
  assert.equal(h.calls(), 1);
  const debug = await h.handlers.debug(new Request(`http://localhost/debug?interactionId=${h.metadata.interactionId}`), h.session.sessionId);
  const inspected = await debug.json();
  assert.deepEqual(inspected.record.turnResponse, result);
  assert.equal(inspected.session.interactions.length, 1);
  assert.match(inspected.session.activeQuestion.answerGuide, /Three/);
  assert.equal(inspected.record.diagnostics.lunaDraft, null);
  assert.equal(inspected.trace.record.interactionId, h.metadata.interactionId);
  assert.ok(inspected.trace.persistenceMs >= 0 && inspected.httpTotalMs >= 0);
  assert.equal(JSON.stringify(result).includes("answerGuide"), false);
});

test("reject unknown/duplicate/missing fields, transcript, invalid metadata before providers", async () => {
  const h = await harness();
  for (const [field, value] of [["transcript", "three"], ["extra", "x"], ["questionId", "duplicate"]]) {
    const data = h.form(); data.append(field!, value!);
    assert.equal((await h.turn(data)).status, 400);
  }
  for (const value of ["-1", "1.5", "", " 0", "1e0", "01", "9007199254740992"]) {
    const data = h.form(); data.set("expectedTurnNumber", value);
    assert.equal((await h.turn(data)).status, 400);
  }
  for (const field of ["interactionId", "questionId", "expectedTurnNumber", "audio"]) {
    const data = h.form(); data.delete(field);
    assert.equal((await h.turn(data)).status, 400);
  }
  const data = h.form(); data.set("audio", "not a file"); assert.equal((await h.turn(data)).status, 400);
  const badId = h.form(); badId.set("interactionId", "bad"); assert.equal((await h.turn(badId)).status, 400);
  assert.equal((await h.turn(h.form(), "bad")).status, 400);
  assert.equal(h.calls(), 0);
});

test("audio cap, metadata pairs and signatures reject before provider; decoder errors remain 415", async () => {
  const h = await harness();
  for (const [file, status] of [
    [new File([], "empty.webm", { type: "audio/webm" }), 400],
    [new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "huge.webm", { type: "audio/webm" }), 413],
    [new File(["junk"], "bad.webm", { type: "audio/webm" }), 415],
    [new File(["RIFFxxxxWAVE"], "bad.webm", { type: "audio/webm" }), 415],
    [new File(["RIFFxxxxWAVE"], "bad.wav", { type: "audio/mp4" }), 415],
    [new File(["junk"], "bad.ogg", { type: "audio/ogg" }), 415],
  ] as const) {
    const data = h.form(); data.set("audio", file);
    const response = await h.turn(data); assert.equal(response.status, status);
    assert.ok((await response.json()).error.requestId);
  }
  assert.equal(h.calls(), 0);
  await validateContainer(new File(["RIFFxxxxWAVE"], "ok.wav", { type: "audio/wav" }));
  await validateContainer(new File(["0000ftypM4A "], "ok.m4a", { type: "audio/mp4" }));
  h.runtime.pipeline.transcribe = async () => { throw new PipelineError("UNSUPPORTED_AUDIO"); };
  assert.equal((await h.turn()).status, 415);
});

test("unknown sessions, stale turns, unavailable store, safe provider errors", async () => {
  const h = await harness();
  assert.equal((await h.turn(h.form(), randomUUID())).status, 404);
  const data = h.form(); data.set("expectedTurnNumber", "1"); assert.equal((await h.turn(data)).status, 409);
  h.runtime.pipeline.transcribe = async () => { throw new Error("secret provider payload"); };
  const response = await h.turn(); assert.equal(response.status, 502);
  assert.equal(JSON.stringify(await response.json()).includes("secret"), false);
  const unavailable = createHttpHandlers(() => { throw new PipelineError("PERSISTENCE_ERROR"); }, env);
  assert.equal((await unavailable.create(jsonRequest({ sceneId: "demo-scene" }))).status, 503);
});

test("debug is 404 unless exact local opt-in, before runtime lookup", async () => {
  for (const environment of [{}, { NODE_ENV: "development" }, { NODE_ENV: "production", PIPELINE_DEBUG: "true" }, { NODE_ENV: "test", PIPELINE_DEBUG: "true" }, { NODE_ENV: "development", PIPELINE_DEBUG: "TRUE" }]) {
    assert.equal(debugEnabled(environment), false);
    const handlers = createHttpHandlers(() => { throw new Error("must not initialize"); }, environment);
    assert.equal((await handlers.debug(new Request("http://localhost/debug"), "invalid")).status, 404);
  }
  assert.equal(debugEnabled(env), true);
  const h = await harness();
  assert.equal((await h.handlers.debug(new Request("http://localhost/debug?extra=x"), h.session.sessionId)).status, 400);
  assert.equal((await h.handlers.debug(new Request("http://localhost/debug?interactionId=bad"), h.session.sessionId)).status, 400);
});

test("memory is only dev/test; postgres and production fail explicitly", () => {
  for (const configuration of [{ NODE_ENV: "production" }, { NODE_ENV: "production", PIPELINE_STORE: "memory" }, { NODE_ENV: "development", PIPELINE_STORE: "postgres" }, {}]) {
    assert.throws(() => selectStore(configuration), (error) => error instanceof PipelineError && error.code === "PERSISTENCE_ERROR");
  }
  assert.ok(selectStore({ NODE_ENV: "test" }));
});


test("store initialization failures return a sanitized persistence 503", async () => {
  for (const detail of ["DATABASE_URL is not set: private configuration", "production memory is unavailable"]) {
    const handlers = createHttpHandlers(() => createPipelineRuntime(
      { NODE_ENV: "production" },
      () => { throw new Error("providers must remain lazy"); },
      () => { throw new Error(detail); },
    ), { NODE_ENV: "production" });
    const response = await handlers.create(jsonRequest({ sceneId: "demo-scene" }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, "PERSISTENCE_ERROR");
    assert.equal(body.error.message, "The session store is unavailable.");
    assert.equal(JSON.stringify(body).includes(detail), false);
  }
});
