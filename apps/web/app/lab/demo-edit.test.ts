import { test } from "node:test";
import assert from "node:assert/strict";
import { demoPlaybackAt, demoWatchedSeconds, DEMO_FILM_SECONDS, TREASURE_EDIT, nextDemoExercise } from "./demo-edit.ts";

test("the demo plays complete ordered story clips, skips side trips and ends before the unrelated recap", () => {
  let total=0;
  for (const [index,clip] of TREASURE_EDIT.clips.entries()) {
    assert.ok(clip.out>clip.in);
    if(index) assert.ok(clip.in>TREASURE_EDIT.clips[index-1]!.out);
    assert.deepEqual(demoPlaybackAt(clip.in),{kind:"play"});
    const next=TREASURE_EDIT.clips[index+1];
    assert.deepEqual(demoPlaybackAt(clip.out),next?{kind:"seek",time:next.in}:{kind:"done"});
    assert.ok(Math.abs(demoWatchedSeconds(clip.in)-total)<.001);
    total+=clip.out-clip.in;
  }
  assert.ok(DEMO_FILM_SECONDS<115);
  assert.ok(Math.abs(demoWatchedSeconds(1445)-DEMO_FILM_SECONDS)<.001);
  assert.deepEqual(TREASURE_EDIT.pauseIds,["ep3-55"]);
});

import questions from "./demo-questions.json" with { type: "json" };
import lines from "./lines.json" with { type: "json" };
import { statSync } from "node:fs";
test("every translated demo question has matching captions and an actual prepared voice asset", () => {
  assert.deepEqual(Object.keys(questions).sort(),["de","es","fr","hi","ja","zh"]);
  const captions: Record<string,string> = lines;
  for (const [language,values] of Object.entries(questions)) {
    assert.equal(Object.keys(values).length,4);
    for (const [key,text] of Object.entries(values)) {
      const id=`${key}_${language}`;
      assert.equal(captions[id],text);
      assert.ok(statSync(new URL(`../../public/media/lab/${id}.m4a`,import.meta.url)).size>1000);
    }
  }
});

test("one Next exercise button follows the remaining exercises, including automatic lesson starts", () => {
  assert.equal(nextDemoExercise([]),"count");
  assert.equal(nextDemoExercise(["count"]),"addition");
  assert.equal(nextDemoExercise(["count","translation"]),"addition");
  assert.equal(nextDemoExercise(["count","addition"]),"translation");
  assert.equal(nextDemoExercise(["count","addition","translation"]),"story");
});
