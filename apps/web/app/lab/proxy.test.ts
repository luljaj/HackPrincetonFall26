import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../api/voice/route.ts";

const request = (body: string, signal?: AbortSignal) => new Request("http://localhost/api/voice", { method: "POST", body, signal });

test("invalid requests never reach voice runtime", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  for (const body of ["broken", "null", "[]", "{}", '{"text":12}', '{"text":" "}', JSON.stringify({ text: "x".repeat(601) })]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("proxy trims text, forwards streaming bytes/status and disables caching", async (t) => {
  const bytes = '{"type":"start","sampleRate":24000}\n';
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, "http://127.0.0.1:8766/speech");
    assert.equal(options?.body, '{"text":"Hola"}');
    assert.equal(options?.cache, "no-store");
    return new Response(bytes, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
  });
  const response = await POST(request('{"text":" Hola "}'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/x-ndjson");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");
  assert.equal(await response.text(), bytes);
});

test("proxy preserves busy status and runtime failure becomes 503", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("busy", { status: 429 }));
  assert.equal((await POST(request('{"text":"Hola"}'))).status, 429);
  fetch.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal((await POST(request('{"text":"Hola"}'))).status, 503);
});

test("request cancellation propagates to upstream fetch", async (t) => {
  const controller = new AbortController();
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => {
    signal = options?.signal ?? undefined;
    return new Response("stream");
  });
  await POST(request('{"text":"Hola"}', controller.signal));
  assert.equal(signal?.aborted, false);
  controller.abort();
  assert.equal(signal?.aborted, true);
});
