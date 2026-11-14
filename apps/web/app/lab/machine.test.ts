// Run: node --test apps/web/app/lab/machine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL, next, type Ctx, type Event } from "./machine.ts";

const run = (events: Event[], c: Ctx = INITIAL) => events.reduce(next, c);
const ask: Event[] = ["PAUSE_POINT", "TRANSITION_DONE", "LINE_DONE"]; // -> listening

test("happy path returns to the episode", () => {
  assert.equal(run([...ask, "SPEECH_END", "CORRECT", "LINE_DONE", "TRANSITION_DONE"]).stage, "watching");
});

test("wrong answers teach, then Dora gives the answer", () => {
  const once = run([...ask, "SPEECH_END", "WRONG"]);
  assert.equal(once.stage, "teaching");
  assert.equal(run(["LINE_DONE", "SPEECH_END", "WRONG"], once).stage, "giving");
});

test("silence nudges once, then gives the answer", () => {
  const nudged = run([...ask, "SILENCE"]);
  assert.equal(nudged.stage, "nudging");
  assert.equal(run(["LINE_DONE", "SILENCE"], nudged).stage, "giving");
});

test("unclear asks again; errors exit gracefully", () => {
  assert.equal(run([...ask, "SPEECH_END", "UNCLEAR"]).stage, "clarifying");
  assert.equal(run([...ask, "SPEECH_END", "ERROR", "LINE_DONE"]).stage, "exiting");
});

test("leaving mid-question gets a welcome back; leaving while watching doesn't", () => {
  assert.equal(run([...ask, "AWAY", "BACK"]).stage, "welcome");
  assert.equal(run(["AWAY", "BACK"]).stage, "watching");
});

test("events that don't apply are ignored", () => {
  assert.equal(next(INITIAL, "CORRECT"), INITIAL);
});
