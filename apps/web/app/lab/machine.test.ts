// Run: node --test apps/web/app/lab/machine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL, next, type Ctx, type Event, type Stage } from "./machine.ts";

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

test("language practice models a missed word again, then ends after a second attempt", () => {
  const learning: Ctx = { ...INITIAL, known: true, practice: true };
  const celebrated = run([...ask, "SPEECH_END", "CORRECT"], learning);
  assert.equal(run(["LINE_DONE"], celebrated).stage, "practicing");
  const listening = run(["LINE_DONE", "LINE_DONE"], celebrated);
  assert.deepEqual([listening.stage, listening.practiced], ["listening", true]);
  assert.equal(run(["SPEECH_END", "CORRECT", "LINE_DONE"], listening).stage, "exiting"); // said it: praise, then the show
  const retry = run(["SPEECH_END", "WRONG", "LINE_DONE"], listening);
  assert.equal(retry.stage, "listening");
  assert.equal(retry.nudges, 1);
  assert.equal(run(["SPEECH_END", "WRONG", "LINE_DONE"], retry).stage, "exiting");
  assert.equal(run(["SPEECH_END", "CORRECT", "LINE_DONE"], retry).stage, "exiting");
  const nudged = run(["SILENCE"], listening);
  assert.equal(nudged.stage, "nudging"); // shy: one "Your turn!", then Dora says it
  assert.equal(run(["LINE_DONE", "SILENCE", "LINE_DONE"], nudged).stage, "exiting");
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

test("a parent-requested language lesson enters practice directly, then resumes the show", () => {
  const listening = run(["PAUSE_POINT", "TRANSITION_DONE", "LINE_DONE"], { ...INITIAL, practiceOnly: true });
  assert.equal(listening.stage, "listening");
  assert.equal(listening.practiced, true);
  assert.equal(run(["SPEECH_END", "CORRECT", "LINE_DONE", "TRANSITION_DONE"], listening).stage, "watching");
});

test("pause freezes the episode and teaching ladder; resuming never awards an answer or leaves thinking stuck", () => {
  const phases: Stage[] = ["watching","entering","asking","listening","thinking","teaching","practicing","celebrating","exiting"];
  for (const stage of phases) {
    const original = { ...INITIAL, stage, tries: 1, nudges: 1, practiced: true };
    const paused = next(original,"PAUSE");
    assert.equal(paused.stage,"paused");
    for (const event of ["LINE_DONE","CORRECT","SILENCE","PAUSE_POINT","PAUSE"] satisfies Event[]) assert.equal(next(paused,event),paused);
    const resumed = next(paused,"RESUME");
    assert.equal(resumed.stage,stage === "thinking" ? "listening" : stage);
    assert.deepEqual([resumed.tries,resumed.nudges,resumed.practiced],[1,1,true]);
  }
});
