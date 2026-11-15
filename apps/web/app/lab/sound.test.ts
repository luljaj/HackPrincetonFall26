import assert from "node:assert/strict";
import test from "node:test";
import { afterRelease, canTake, silencesGreeting } from "./sound.ts";

test("a higher owner takes the sound, a lower one can't", () => {
  assert.ok(canTake("show", "greeting"));
  assert.ok(canTake("greeting", "dub"));
  assert.ok(canTake("dub", "pause"));
  assert.ok(canTake("greeting", "greeting")); // a new greeting replaces the old one
  assert.ok(!canTake("dub", "greeting")); // the old bug: the greeting turning the show back up mid-dub
  assert.ok(!canTake("pause", "dub"));
});

test("letting go gives the show its sound back, unless someone else took over", () => {
  assert.equal(afterRelease("greeting", "greeting"), "show");
  assert.equal(afterRelease("dub", "greeting"), "dub"); // a late greeting ending must not undo the dub
  assert.equal(afterRelease("pause", "dub"), "pause");
});

test("a dub or a pause stops the greeting's voice", () => {
  assert.ok(silencesGreeting("dub") && silencesGreeting("pause"));
  assert.ok(!silencesGreeting("greeting") && !silencesGreeting("show"));
});
