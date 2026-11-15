// Run: node --test apps/web/app/lab/quick-judge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearlyCorrect } from "./quick-judge.ts";

const seatbelt = ["seatbelt", "seat belt", "cinturón"];

test("recall requires an accepted name rather than a fuzzy substring", () => {
  assert.equal(clearlyCorrect("the bridge", ["bridge"], "recall"), true);
  assert.equal(clearlyCorrect("fridge", ["bridge"], "recall"), false);
  assert.equal(clearlyCorrect("not the bridge", ["bridge"], "recall"), false);
  assert.equal(clearlyCorrect("bridge or pyramid", ["bridge"], "recall"), false);
  // stored answers often carry an article ("The map"): it must not make the instant path impossible
  assert.equal(clearlyCorrect("map", ["The map"], "recall"), true);
  assert.equal(clearlyCorrect("the map!", ["The map"], "recall"), true);
  assert.equal(clearlyCorrect("maps", ["The map"], "recall"), true);
  assert.equal(clearlyCorrect("mop", ["The map"], "recall"), false);
});

test("clear answers take the instant path, including Whisper's near-misses and other languages", () => {
  for (const said of ["a seatbelt", "Seedbelt", "A SEAT BELT!", "um, the seatbelt?", "cinturon", "Cinturón."]) {
    assert.equal(clearlyCorrect(said, seatbelt), true, said);
  }
});

test("wrong, empty, or vague answers go to Luna", () => {
  for (const said of ["a helmet", "", "seat", "I don't know", "a belt for my pants maybe", "Singuro.", "not a seatbelt", "no seatbelt!", "I don't want a seat belt"]) {
    assert.equal(clearlyCorrect(said, seatbelt), false, said);
  }
});

test("short answers must match exactly", () => {
  assert.equal(clearlyCorrect("the map!", ["map"]), true);
  assert.equal(clearlyCorrect("the mop", ["map"]), false);
});

test("Dora's catchphrases follow the language being learned", async () => {
  const { localFlair } = await import("./flair.ts");
  assert.equal(localFlair("Great job, amigo!", "fr"), "Great job, mon ami!");
  assert.equal(localFlair("Great job, amigo!", ""), "Great job, friend!");
  assert.equal(localFlair("Great job, amigo!", "es"), "Great job, amigo!");
});
