import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { streamVoice } from "./voice.ts";

const header = { type: "start", sampleRate: 24000 };
const audio = { type: "audio", pcm: "AAD/fw==" };
const done = { type: "done", firstAudioSeconds: 0.1, generationSeconds: 0.2 };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(t: TestContext, messages: unknown[], close = true) {
  const sources: { onended: (() => void) | null; stopped: boolean; disconnected: boolean; start: (at: number) => void; stop: () => void; disconnect: () => void }[] = [];
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(messages.map((m) => typeof m === "string" ? m : JSON.stringify(m)).join("\n") + "\n");
      // Split within a JSON record to exercise the incremental decoder.
      controller.enqueue(bytes.slice(0, 7));
      controller.enqueue(bytes.slice(7));
      if (close) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(body));
  const context = {
    currentTime: 0,
    resume: async (): Promise<void> => undefined,
    createBuffer: (_channels: number, length: number, rate: number) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      const source = { onended: null as (() => void) | null, stopped: false, disconnected: false, connect() {}, start() {}, stop() { this.stopped = true; }, disconnect() { this.disconnected = true; } };
      sources.push(source);
      return source;
    },
  };
  const controller = new AbortController();
  const speaking: boolean[] = [];
  const metrics: unknown[] = [];
  const run = () => streamVoice({ text: "Hola", context: context as unknown as AudioContext, destination: {} as AudioNode, signal: controller.signal, onSpeaking: (v) => speaking.push(v), onMetrics: (v) => metrics.push(v) });
  return { run, context, fetch, sources, controller, speaking, metrics, get cancelled() { return cancelled; } };
}

test("completion waits for scheduled audio and disconnects sources", async (t) => {
  const h = harness(t, [header, audio, done]);
  let complete = false;
  const result = h.run().then(() => { complete = true; });
  await tick();
  assert.equal(complete, false);
  assert.equal(h.sources.length, 1);
  assert.deepEqual(h.speaking, [true]);
  h.sources[0]!.onended!();
  await result;
  assert.equal(h.sources[0]!.disconnected, true);
  assert.equal(h.speaking.at(-1), false);
  assert.equal(h.metrics.length, 1);
});

for (const [name, messages] of [
  ["truncated stream", [header, audio]],
  ["audio before header", [audio, done]],
  ["duplicate header", [header, header, done]],
  ["invalid JSON", ["{oops"]],
  ["odd PCM bytes", [header, { type: "audio", pcm: "AA==" }, done]],
  ["service error", [header, { type: "error", error: "Generation failed" }]],
  ["data after completion", [header, audio, done, audio]],
  ["completion without audio", [header, done]],
  ["negative metrics", [header, audio, { ...done, generationSeconds: -1 }]],
] as const) {
  test(`rejects ${name} and stops scheduled audio`, { timeout: 1000 }, async (t) => {
    const h = harness(t, [...messages]);
    await assert.rejects(h.run());
    assert.equal(h.speaking.at(-1), false);
    assert.ok(h.sources.every((s) => s.stopped && s.disconnected));
  });
}

test("abort cancels a pending reader, stops audio, and permits replacement", async (t) => {
  const h = harness(t, [header, audio], false);
  const result = h.run();
  await tick();
  h.controller.abort();
  const outcome = await Promise.race([result.then(() => "resolved", () => "rejected"), tick().then(() => "pending")]);
  assert.equal(outcome, "rejected");
  assert.equal(h.cancelled, true);
  assert.ok(h.sources.every((s) => s.stopped && s.disconnected));
  const replacement = harness(t, [header, audio, done]);
  const next = replacement.run();
  await tick();
  replacement.sources[0]!.onended!();
  await next;
});


test("abort while audio context is resuming settles without starting a request", async (t) => {
  const h = harness(t, [header, audio, done]);
  h.context.resume = () => new Promise<void>(() => {});
  const result = h.run();
  h.controller.abort();
  const outcome = await Promise.race([result.then(() => "resolved", () => "rejected"), tick().then(() => "pending")]);
  assert.equal(outcome, "rejected");
  assert.equal(h.sources.length, 0);
  assert.equal(h.fetch.mock.callCount(), 0);
});

test("already aborted speech never resumes audio or fetches", async (t) => {
  const h = harness(t, [header, audio, done]);
  const resume = t.mock.method(h.context, "resume");
  h.controller.abort();
  await assert.rejects(h.run(), { name: "AbortError" });
  assert.equal(resume.mock.callCount(), 0);
  assert.equal(h.fetch.mock.callCount(), 0);
});

test("busy and unavailable services report actionable errors", async (t) => {
  const h = harness(t, []);
  h.fetch.mock.mockImplementation(async () => new Response("busy", { status: 429 }));
  await assert.rejects(h.run(), /Voice is busy/);
  h.fetch.mock.mockImplementation(async () => new Response("offline", { status: 503 }));
  await assert.rejects(h.run(), /Start the local voice server/);
});
