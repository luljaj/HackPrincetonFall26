import assert from "node:assert/strict";
import test from "node:test";
import { AudioCasesSchema, evaluate, gradeAssessment, timingSummary } from "./run";

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

test("live evaluator leaves alternative valid variants ungraded with fake SDK and preserves hard checks", async () => {
  const { createLunaAdapter } = await import("../../server/pipeline/luna");
  const { offlineDraft } = await import("./cases");
  const luna = createLunaAdapter({ responses: { parse: async (request) => {
    const input = request.input as Array<{ content: string }>;
    const context = JSON.parse(input[1]!.content);
    const draft = offlineDraft(context);
    if (draft.nextQuestion) draft.nextQuestion = { text: "How many apples are there altogether?", answerGuide: "Five; accept 5." };
    if (context.questionKind === "variant") {
      draft.assessment.answerStatus = "incorrect";
      draft.feedbackText = "There are five apples altogether. Thanks for counting.";
    }
    return { status: "completed", output_parsed: draft };
  } } }, "fake-sdk");
  const report = await evaluate({ live: true }, { luna, transcribe: async () => { throw new Error("Text fixtures must bypass ASR."); } });
  assert.equal(report.assessmentErrors, 0);
  assert.equal(report.failures, 0);
  assert.equal(report.ungradedAssessments, 3);
  const variant = report.outputs.find((out) => out.caseId === "wrong-then-correct" && out.step === 2)!;
  assert.equal(variant.grading, "requires_human_review");
  assert.equal(variant.mismatch, null);
  assert.equal((variant.record as { questionText: string }).questionText, "How many apples are there altogether?");
  assert.equal((variant.response as { assessment: { answerStatus: string } }).assessment.answerStatus, "incorrect");
});

test("matching live variant expectations remain graded and offline grading is unchanged", () => {
  const step = { transcript: "two", expected: "correct" as const, expectedQuestion: "How many green apples are on the plate?" };
  assert.equal(gradeAssessment(step, "incorrect", { live: true, isVariant: true, text: "  HOW MANY green apples are on the plate? " }).mismatch, true);
  assert.equal(gradeAssessment(step, "incorrect", { live: false, isVariant: true, text: "A different variant?" }).mismatch, true);
});
