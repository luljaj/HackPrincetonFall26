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

test("language practice: after the answer, learn the word in the new language, one try", () => {
  const learning: Ctx = { ...INITIAL, known: true, practice: true };
  const celebrated = run([...ask, "SPEECH_END", "CORRECT"], learning);
  assert.equal(run(["LINE_DONE"], celebrated).stage, "practicing");
  const listening = run(["LINE_DONE", "LINE_DONE"], celebrated);
  assert.deepEqual([listening.stage, listening.practiced], ["listening", true]);
  assert.equal(run(["SPEECH_END", "CORRECT", "LINE_DONE"], listening).stage, "exiting"); // said it: praise, then the show
  assert.equal(run(["SPEECH_END", "WRONG", "LINE_DONE"], listening).stage, "exiting"); // missed: Dora says it, then the show
  assert.equal(run(["SILENCE", "LINE_DONE"], listening).stage, "exiting"); // shy: no nagging
});

test("the word is taught even when Dora had to give the answer, and only when learning", () => {
  const gave = run([...ask, "SILENCE", "LINE_DONE", "SILENCE", "LINE_DONE", "SILENCE"], { ...INITIAL, known: true, practice: true });
  assert.equal(gave.stage, "giving");
  assert.equal(run(["LINE_DONE"], gave).stage, "practicing");
  assert.equal(run([...ask, "SPEECH_END", "CORRECT", "LINE_DONE"]).stage, "exiting");
});

test("leaving mid-question gets a welcome back; leaving while watching doesn't", () => {
  assert.equal(run([...ask, "AWAY", "BACK"]).stage, "welcome");
  assert.equal(run(["AWAY", "BACK"]).stage, "watching");
});

test("events that don't apply are ignored", () => {
  assert.equal(next(INITIAL, "CORRECT"), INITIAL);
});
