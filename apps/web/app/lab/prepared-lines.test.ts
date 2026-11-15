import { strict as assert } from "node:assert";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { PreparedLines } from "./prepared-lines.ts";

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("preparation runs one request at a time and reuses completed lines by language", async () => {
  const requests: { text: string; language: string; result: ReturnType<typeof deferred> }[] = [];
  const lines = new PreparedLines((text, language) => {
    const result = deferred();
    requests.push({ text, language, result });
    return result.promise;
  });
  lines.prepare("Map", "hi");
  lines.prepare("Map", "hi");
  lines.prepare("Map", "es");
  assert.equal(requests.length, 1);
  requests[0]!.result.resolve("Hindi audio");
  await setImmediate();
  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.language, "es");
  requests[1]!.result.resolve("Spanish audio");
  await setImmediate();
  lines.cancel();
  lines.prepare("Map", "hi");
  assert.equal(requests.length, 2);
  assert.equal(lines.get("Map", "hi"), "Hindi audio");
  assert.equal(lines.get("Map", "es"), "Spanish audio");
});

test("switching language discards stale work and starts the new queue after cancellation settles", async () => {
  const requests: { text: string; signal: AbortSignal; result: ReturnType<typeof deferred> }[] = [];
  const lines = new PreparedLines((text, _language, signal) => {
    const result = deferred();
    requests.push({ text, signal, result });
    return result.promise;
  });
  lines.prepare("Old language", "es");
  lines.prepare("Unused follow-up", "es");
  lines.cancel();
  lines.prepare("New language", "hi");
  assert.equal(requests[0]!.signal.aborted, true);
  requests[0]!.result.resolve("Stale audio");
  await setImmediate();
  assert.equal(lines.get("Old language", "es"), undefined);
  assert.deepEqual(requests.map((request) => request.text), ["Old language", "New language"]);
  requests[1]!.result.reject(new Error("Voice preempted"));
  await setImmediate();
  lines.prepare("New language", "hi");
  assert.equal(requests.length, 3);
  requests[2]!.result.resolve("Hindi audio");
  await setImmediate();
  assert.equal(lines.get("New language", "hi"), "Hindi audio");
});
