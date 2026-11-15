import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDITION_LESSONS, additionLesson, wantsAddition } from "./focus-lessons.ts";
import translations from "./focus-translations.json" with { type: "json" };

test("raising Numbers queues real addition, once per focus change", () => {
  assert.equal(wantsAddition("usual", "more"), true);
  assert.equal(wantsAddition("more", "more"), false);
  assert.equal(wantsAddition("more", "usual"), false);
  assert.match(additionLesson(0).question, /Two stars and one more/);
  assert.equal(additionLesson(0).answer, "three");
  assert.equal(additionLesson(1).answer, "four");
  assert.equal(additionLesson(2).answer, "five");
  assert.equal(additionLesson(3).id, additionLesson(0).id);
});

test("every inserted addition has the correct answer to practise in all supported languages", () => {
  for (const lesson of ADDITION_LESSONS) {
    const translation = translations[lesson.id];
    assert.equal(translation.english, lesson.answer);
    assert.deepEqual(Object.keys(translation).filter(k => k !== "english").sort(), ["de", "es", "fr", "hi", "ja", "zh"]);
    for (const word of Object.values(translation)) if (typeof word !== "string") {
      assert.ok(word.word.trim());
      assert.ok(word.ipa.trim());
    }
  }
});

test("the treasure edit keeps the arithmetic and uses keys in the question, answer and prepared voice", () => {
  for (const index of [0,1,2,3]) {
    const lesson=additionLesson(index,"keys");
    assert.match(lesson.question,/keys/);
    assert.doesNotMatch(lesson.question,/stars/);
    assert.equal(lesson.answer,additionLesson(index).answer);
    assert.ok(lesson.accept.some(value => value === lesson.answer+" keys"));
    assert.match(lesson.line,/^demoKeysAddition[123]$/);
  }
});
