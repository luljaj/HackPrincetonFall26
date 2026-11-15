// Run: node --test apps/web/app/lab/listen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIP, VAD, VAD_START, encodeWav, speechWindow, vadStep } from "./listen.ts";

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

test("a short blip (Dora's voice tail, a tap) doesn't start an answer", () => {
  assert.equal(run([...frames(300, 0.002), ...frames(150, 0.1), ...frames(VAD.noSpeechMs, 0.002)]).done, "silent");
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

test("the clip is the answer only: from just before speech started to just after it stopped", () => {
  const rate = 48000;
  // 6 s of waiting, then speech detected at 6.2 s after 200 ms of loudness, then 400 ms of quiet at 8 s.
  const [from, to] = speechWindow(8 * rate, rate, 6.2 * rate, 200, 400);
  assert.equal(from, Math.round((6.2 - 0.2 - CLIP.prerollMs / 1000) * rate)); // 0.3 s before the speech began
  assert.equal(to, 8 * rate - Math.round((0.4 - CLIP.tailMs / 1000) * rate)); // keeps 250 ms of the trailing quiet
  assert.ok((to - from) / rate < 2.2, "about 2 s instead of 8");
  assert.deepEqual(speechWindow(1000, rate, 100, 200, 0), [0, 1000]); // never runs past either end
});

test("a clip is a 16 kHz mono 16-bit WAV, a fraction of the size of the browser recording", () => {
  const rate = 48000;
  const tone = Float32Array.from({ length: rate }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5); // 1 s
  const wav = encodeWav(tone, rate);
  const view = new DataView(wav.buffer);
  const str = (at: number, n: number) => String.fromCharCode(...wav.slice(at, at + n));
  assert.equal(str(0, 4), "RIFF");
  assert.equal(str(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16); // bits
  assert.equal(view.getUint32(40, true), 16000 * 2); // 1 s of 16-bit samples
  assert.equal(wav.length, 44 + 32000); // ~32 KB per second (Chrome's PCM recording: ~372 KB)
  const peak = Math.max(...Array.from({ length: 16000 }, (_, i) => Math.abs(view.getInt16(44 + i * 2, true))));
  assert.ok(peak > 0.45 * 0x7fff && peak <= 0.5 * 0x7fff + 1, "the signal survives resampling");
});
