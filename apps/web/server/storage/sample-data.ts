import type { InteractionRecord, PipelineStore, SessionRecord } from "./contract";

// Synthetic "Sample data" session (learning-progress-plan.md §8.2): the on-stage fallback.
// It illustrates the implemented episode interaction only. No real child, no before/after check.
// The parent fixture (lib/parent/fixtures.ts) is derived from these same records.

export const SAMPLE_SESSION_ID = "sample-session";

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
  transcriptionModel: null,
  lunaModel: null,
  promptRevision: "sample",
  transcriptionMs: null,
  lunaMs: null,
  precommitMs: null,
};

export const sampleSessionRecord: SessionRecord = {
  sessionId: SAMPLE_SESSION_ID,
  createdAt: "2026-11-14T12:00:00.000Z",
  sceneId: "sample-scene",
  objectiveId: "sample-counting",
  sceneSnapshot: { objective: "Count a small group of objects (synthetic example)" },
  activeQuestion: q1,
  turnNumber: 0,
  assistanceProvided: false,
  isSample: true,
};

export const sampleInteractions: InteractionRecord[] = [
  {
    sessionId: SAMPLE_SESSION_ID,
    interactionId: "sample-interaction-1",
    turnNumber: 1,
    sceneId: "sample-scene",
    objectiveId: "sample-counting",
    completedAt: "2026-11-14T12:00:10.000Z",
    question: q1,
    transcript: "five",
    response: {
      type: "teaching",
      text: "Let's count them together, touching each apple once: one, two, three. How many apples are there?",
    },
    nextQuestion: q2,
    assessment: {
      answerStatus: "incorrect",
      evidence: "Said five; the basket shows three apples.",
      possibleMisconception: "counted the basket and the bananas too",
      assistanceBeforeAnswer: false,
    },
    assistanceInResponse: true,
    parentSummary: "Answered incorrectly; assistance was given.",
    turnResponse: { sample: true },
    diagnostics: noDiagnostics,
  },
  {
    sessionId: SAMPLE_SESSION_ID,
    interactionId: "sample-interaction-2",
    turnNumber: 2,
    sceneId: "sample-scene",
    objectiveId: "sample-counting",
    completedAt: "2026-11-14T12:00:25.000Z",
    question: q2,
    transcript: "three",
    response: { type: "teaching", text: "Yes! Three apples. ¡Excelente!" },
    nextQuestion: null,
    assessment: {
      answerStatus: "correct",
      evidence: "Said three after counting along.",
      possibleMisconception: null,
      assistanceBeforeAnswer: true,
    },
    assistanceInResponse: false,
    parentSummary: "Answered correctly after assistance.",
    turnResponse: { sample: true },
    diagnostics: noDiagnostics,
  },
];

/** Writes the sample session through the normal store path. Caller deletes any old copy first. */
export async function writeSampleSession(store: PipelineStore): Promise<void> {
  await store.createSession(sampleSessionRecord);
  let expected = 0;
  for (const interaction of sampleInteractions) {
    await store.commitTurn({ sessionId: SAMPLE_SESSION_ID, expectedTurnNumber: expected, interaction });
    expected = interaction.turnNumber;
  }
}
