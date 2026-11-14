// Run: node --test apps/web/app/lab/listen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { VAD, VAD_START, vadStep } from "./listen.ts";

const run = (frames: number[]) => {
  let state = VAD_START;
  for (const rms of frames) {
    const step = vadStep(state, rms);
    state = step.state;
    if (step.done) return { done: step.done, at: state.elapsed };
  }
  return { done: null, at: state.elapsed };
};
const frames = (ms: number, rms: number) => Array(Math.round(ms / VAD.frameMs)).fill(rms);

test("speech then a pause ends the answer", () => {
  const r = run([...frames(300, 0.002), ...frames(600, 0.1), ...frames(1000, 0.002)]);
  assert.equal(r.done, "spoke");
  assert.ok(r.at < 300 + 600 + 800, `ended at ${r.at} ms`);
});

test("short pauses between words don't end it", () => {
  const r = run([...frames(300, 0.002), ...frames(400, 0.1), ...frames(400, 0.002), ...frames(400, 0.1), ...frames(1000, 0.002)]);
  assert.equal(r.done, "spoke");
  assert.ok(r.at > 300 + 1200, "kept listening through the 400 ms gap");
});

test("nobody speaks: silent after the no-speech timeout", () => {
  assert.deepEqual(run(frames(VAD.noSpeechMs + 100, 0.002)), { done: "silent", at: VAD.noSpeechMs });
});

test("a steady noisy room isn't speech, a click isn't either", () => {
  assert.equal(run([...frames(300, 0.03), ...frames(VAD.noSpeechMs, 0.035)]).done, "silent");
  assert.equal(run([...frames(300, 0.002), 0.5, ...frames(VAD.noSpeechMs, 0.002)]).done, "silent");
});

test("a kid who answers the instant Dora stops is still heard", () => {
  const speechWithGaps = Array.from({ length: 20 }, (_, i) => (i % 5 === 4 ? 0.003 : 0.1)); // 600 ms, tiny gaps between syllables
  assert.equal(run([...speechWithGaps, ...frames(1000, 0.003)]).done, "spoke");
});

test("throttled timers (1 s ticks in a background tab) still end the answer", () => {
  let state = VAD_START;
  let done = null;
  for (const rms of [0.002, 0.1, 0.1, 0.002]) ({ state, done } = vadStep(state, rms, 1000));
  assert.equal(done, "spoke");
});
