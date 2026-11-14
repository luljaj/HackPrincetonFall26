import type { SessionProgress } from "./types";

// Synthetic sample session. Shown with a visible "Sample data" badge.
// It illustrates the implemented episode interaction only — no real child, no before/after check.
export const SAMPLE_SESSION_ID = "sample-session";

export const sampleSession: SessionProgress = {
  sessionId: SAMPLE_SESSION_ID,
  objectiveId: "sample-counting",
  objective: "Count a small group of objects (synthetic example)",
  isSample: true,
  interactions: [
    {
      interactionId: "sample-interaction-1",
      turnNumber: 1,
      questionText: "How many apples are in Dora's basket?",
      transcript: "five",
      responseText:
        "Let's count them together, touching each apple once: one, two, three. How many apples are there?",
      responseType: "teaching",
      assessment: {
        answerStatus: "incorrect",
        evidence: "Said five; the basket shows three apples.",
        possibleMisconception: "may have counted the basket and the bananas too",
        assistanceBeforeAnswer: false,
      },
      assistanceInResponse: true,
    },
    {
      interactionId: "sample-interaction-2",
      turnNumber: 2,
      questionText: "How many apples are there?",
      transcript: "three",
      responseText: "Yes! Three apples. ¡Excelente!",
      responseType: "teaching",
      assessment: {
        answerStatus: "correct",
        evidence: "Said three after counting along.",
        possibleMisconception: null,
        assistanceBeforeAnswer: true,
      },
      assistanceInResponse: false,
    },
  ],
  episode: {
    turns: 2,
    responsesWithAssistance: 1,
    finalStatus: "correct",
    parentSummary: "Answered correctly after assistance.",
  },
};
