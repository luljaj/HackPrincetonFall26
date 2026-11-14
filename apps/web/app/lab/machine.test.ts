// Run: node --test apps/web/app/lab/machine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL, next, type Ctx, type Event } from "./machine.ts";

const run = (events: Event[], c: Ctx = INITIAL) => events.reduce(next, c);
const ask: Event[] = ["PAUSE_POINT", "TRANSITION_DONE", "LINE_DONE"]; // -> listening

test("happy path returns to the episode", () => {
  assert.equal(run([...ask, "SPEECH_END", "CORRECT", "LINE_DONE", "TRANSITION_DONE"]).stage, "watching");
});

const known: Ctx = { ...INITIAL, known: true };
const wrong: Event[] = ["SPEECH_END", "WRONG"];

test("teaching ladder: hint, choices, model + repeat, then a warm give", () => {
  const hint = run([...ask, ...wrong], known);
  assert.deepEqual([hint.stage, hint.tries], ["teaching", 1]);
  const choices = run(["LINE_DONE", ...wrong], hint);
  assert.deepEqual([choices.stage, choices.tries], ["teaching", 2]);
  const model = run(["LINE_DONE", ...wrong], choices);
  assert.equal(model.stage, "modeling");
  assert.equal(run(["LINE_DONE", "SPEECH_END", "CORRECT"], model).stage, "celebrating"); // repeated it
  assert.equal(run(["LINE_DONE", ...wrong], model).stage, "giving");
});

test("unknown answers skip modeling and let the show reveal it", () => {
  assert.equal(run([...ask, ...wrong, "LINE_DONE", ...wrong, "LINE_DONE", ...wrong]).stage, "giving");
});

test("silence nudges once, then models (or gives)", () => {
  const nudged = run([...ask, "SILENCE"], known);
  assert.equal(nudged.stage, "nudging");
  assert.equal(run(["LINE_DONE", "SILENCE"], nudged).stage, "modeling");
  assert.equal(run([...ask, "SILENCE", "LINE_DONE", "SILENCE"]).stage, "giving");
});

test("mumbling can't loop forever; errors exit gracefully", () => {
  const once = run([...ask, "SPEECH_END", "UNCLEAR"]);
  assert.equal(once.stage, "clarifying");
  assert.equal(run(["LINE_DONE", "SPEECH_END", "UNCLEAR"], once).stage, "giving");
  assert.equal(run([...ask, "SPEECH_END", "ERROR", "LINE_DONE"]).stage, "exiting");
});

test("leaving mid-question gets a welcome back; leaving while watching doesn't", () => {
  assert.equal(run([...ask, "AWAY", "BACK"]).stage, "welcome");
  assert.equal(run(["AWAY", "BACK"]).stage, "watching");
});

test("events that don't apply are ignored", () => {
  assert.equal(next(INITIAL, "CORRECT"), INITIAL);
});
