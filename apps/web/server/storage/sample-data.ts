import { exampleScene } from "../scenes/example.scene";
import type { InteractionRecord, PipelineStore, SessionRecord } from "./contract";

// Synthetic "Sample data" session (learning-progress-plan.md §8.2): the on-stage fallback.
// It illustrates the implemented episode interaction only. No real child, no before/after check.
// The parent fixture (lib/parent/fixtures.ts) is derived from these same records.

import { SAMPLE_INTERACTION_IDS, SAMPLE_SESSION_ID } from "../../lib/parent/sample-id";

export { SAMPLE_SESSION_ID };

const q1 = {
  questionId: "sample-q1",
  text: "How many apples are in Dora's basket?",
  answerGuide: "Three apples. Bananas and the basket don't count.",
};
const q2 = {
  questionId: "sample-q2",
  text: "How many apples are there?",
  answerGuide: "Three.",
};

const noDiagnostics = {
  lunaDraft: null,
  transcriptionModel: "sample",
  lunaModel: null,
  promptRevision: "sample",
  timings: { transcriptionMs: null, lunaMs: null, processingBeforeCommitMs: 0 },
};

export const sampleSessionRecord: SessionRecord = {
  sessionId: SAMPLE_SESSION_ID,
  createdAt: "2026-11-14T12:00:00.000Z",
  sceneSnapshot: { ...exampleScene, sceneId: "sample-scene", objectiveId: "sample-counting", objective: "Count a small group of objects (synthetic example)", initialQuestion: q1 },
  latestParentSummary: null,
  activeQuestion: q1,
  turnNumber: 0,
  assistanceProvided: false,
  isSample: true,
};

const records: Omit<InteractionRecord, "turnResponse">[] = [
  {
    sessionId: SAMPLE_SESSION_ID,
    interactionId: SAMPLE_INTERACTION_IDS[0],
    turnNumber: 1,
    sceneId: "sample-scene",
    objectiveId: "sample-counting",
    completedAt: "2026-11-14T12:00:10.000Z",
    questionId: q1.questionId, questionText: q1.text, answerGuide: q1.answerGuide,
    transcript: "five",
    responseType: "teaching",
    responseText: "Let's count them together, touching each apple once: one, two, three. How many apples are there?",
    nextQuestion: q2,
    assessment: {
      answerStatus: "incorrect",
      evidence: "Said five; the basket shows three apples.",
      possibleMisconception: "counted the basket and the bananas too",
      assistanceBeforeAnswer: false,
    },
    assistanceInResponse: true,
    parentSummary: "Answered incorrectly; assistance was given.",
    diagnostics: noDiagnostics,
  },
  {
    sessionId: SAMPLE_SESSION_ID,
    interactionId: SAMPLE_INTERACTION_IDS[1],
    turnNumber: 2,
    sceneId: "sample-scene",
    objectiveId: "sample-counting",
    completedAt: "2026-11-14T12:00:25.000Z",
    questionId: q2.questionId, questionText: q2.text, answerGuide: q2.answerGuide,
    transcript: "three",
    responseType: "teaching", responseText: "Yes! Three apples. ¡Excelente!",
    nextQuestion: null,
    assessment: {
      answerStatus: "correct",
      evidence: "Said three after counting along.",
      possibleMisconception: null,
      assistanceBeforeAnswer: true,
    },
    assistanceInResponse: false,
    parentSummary: "Answered correctly after assistance.",
    diagnostics: noDiagnostics,
  },
];
export const sampleInteractions: InteractionRecord[] = records.map((record) => ({
  ...record,
  turnResponse: {
    sessionId: record.sessionId, interactionId: record.interactionId, turnNumber: record.turnNumber,
    response: { type: record.responseType, text: record.responseText, nextQuestion: record.nextQuestion && { questionId: record.nextQuestion.questionId, text: record.nextQuestion.text } },
    assessment: record.assessment,
  },
}));

/** Writes the sample session through the normal store path. Caller deletes any old copy first. */
export async function writeSampleSession(store: PipelineStore): Promise<void> {
  await store.createSession(sampleSessionRecord);
  let expected = 0;
  for (const interaction of sampleInteractions) {
    await store.commitTurn({ sessionId: SAMPLE_SESSION_ID, expectedTurnNumber: expected, interaction });
    expected = interaction.turnNumber;
  }
}
