import assert from "node:assert/strict";
import test from "node:test";
import { afterRelease, canTake } from "./sound.ts";

test("a higher owner takes the sound, a lower one can't", () => {
  assert.ok(canTake("show", "dub"));
  assert.ok(canTake("dub", "pause"));
  assert.ok(canTake("dub", "dub"));
  assert.ok(!canTake("pause", "dub"));
});

test("letting go gives the show its sound back, unless someone else took over", () => {
  assert.equal(afterRelease("dub", "dub"), "show");
  assert.equal(afterRelease("pause", "dub"), "pause"); // a dub ending mid-pause must not turn the show back up
});
