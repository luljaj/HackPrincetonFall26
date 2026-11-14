import assert from "node:assert/strict";
import test from "node:test";
import { AudioCasesSchema, evaluate, timingSummary } from "./run";

test("offline evaluator exercises eleven scenarios through canonical service without credentials", async () => {
  const report = await evaluate();
  assert.equal(report.mode, "offline"); assert.equal(report.caseCount, 11);
  assert.equal(report.assessmentErrors, 0); assert.equal(report.failures, 0);
  assert.equal(report.outputs.length, 15);
  assert.equal(report.models.luna, "offline-oracle");
  assert.ok(report.timings.totalMs);
  assert.ok(report.outputs.some((out) => out.caseId === "wrong-then-wrong" && out.step === 2));
});
test("median includes even samples and no-data stages remain explicit", () => {
  assert.deepEqual(timingSummary([4, 1, 2, 3]), { medianMs: 2.5, slowestMs: 4 });
  assert.deepEqual(timingSummary([]), { medianMs: null, slowestMs: null });
});
test("audio fixtures require explicit live mode", async () => {
  await assert.rejects(evaluate({ audioCases: [{ id: "audio", steps: [], notes: "synthetic", audioPath: "unused.wav" }] }), /require --live/);
});

test("audio manifests require one annotated turn and absolute supported paths", () => {
  assert.equal(AudioCasesSchema.safeParse([{ id: "audio", audioPath: "/tmp/recording.wav", notes: "Synthetic silence.", steps: [{ transcript: "", expected: "not_assessed" }] }]).success, true);
  assert.equal(AudioCasesSchema.safeParse([{ id: "audio", audioPath: "relative.mp3", notes: "Synthetic.", steps: [] }]).success, false);
});
