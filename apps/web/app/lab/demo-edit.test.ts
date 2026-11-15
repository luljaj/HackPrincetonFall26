import { test } from "node:test";
import assert from "node:assert/strict";
import spots from "./spots.json" with { type: "json" };
import lessons from "./lessons.json" with { type: "json" };
import { DEMO_EDIT, DEMO_PAUSE_IDS, demoPauseAt, skipTarget } from "./demo-edit.ts";

const pauseAt = (id: string) => demoPauseAt(id, spots.find((s) => s.id === id)!.pauseAt);

test("every demo moment is a real, kept pause, in story order, with its skip point just before it", () => {
  const authored: Record<string, { keep?: boolean }> = lessons;
  let last = 0;
  for (const x of DEMO_EDIT.exercises) {
    assert.ok(spots.some((s) => s.id === x.pauseId), x.pauseId);
    assert.notEqual(authored[x.pauseId]?.keep, false, `${x.pauseId} is dropped in lessons.json`); // demo pauses ignore `asked`, but never a dropped lesson
    const at = pauseAt(x.pauseId);
    assert.ok(at > last, "story order");
    assert.ok(x.from < at && at - x.from < 20, `${x.pauseId}: skip lands 0-20 s before the question`);
    last = at;
  }
  assert.ok(DEMO_EDIT.finale.from > last);
});

test("skip goes to the next exercise's setup, then the finale, then nowhere", () => {
  assert.deepEqual(skipTarget(0, pauseAt), { from: 166.07, label: "1/7 · Who helps when we're lost?" });
  assert.equal(skipTarget(180, pauseAt)?.label, "2/7 · Where do we go next?"); // past the map question
  assert.equal(skipTarget(174.3, pauseAt)?.label, "2/7 · Where do we go next?"); // mid-question: skips to the next one
  assert.equal(skipTarget(590, pauseAt)?.from, 590); // already inside the bridge setup: never jump back
  assert.equal(skipTarget(1250, pauseAt)?.label, "The end");
  assert.equal(skipTarget(1300, pauseAt), null);
  assert.equal(DEMO_PAUSE_IDS.length, DEMO_EDIT.exercises.length);
  // the bridge holds after the bird has walked off, still before the show resumes
  const bridge = spots.find((s) => s.id === "ep3-27")!;
  assert.ok(pauseAt("ep3-27") > bridge.pauseAt && pauseAt("ep3-27") < bridge.resumeAt);
});
