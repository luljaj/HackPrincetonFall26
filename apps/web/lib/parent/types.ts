// Parent-facing view types. Assessment types come from the storage contract
// (server/storage/contract.ts), which is type-only and safe to import in client code.

import type { AnswerStatus, LearningAssessment } from "../../server/storage/contract";

export type { AnswerStatus, LearningAssessment };

// Public, parent-safe shape (learning-progress-plan.md §5).
// Never add answer guides, next-question guides or diagnostics here.
export type SessionProgress = {
  sessionId: string;
  objectiveId: string;
  objective: string;
  isSample: boolean; // drives the "Sample data" badge; needs an is_sample column on sessions
  interactions: Array<{
    interactionId: string;
    turnNumber: number;
    questionText: string;
    transcript: string;
    responseText: string;
    responseType: "teaching" | "clarification";
    assessment: LearningAssessment;
    assistanceInResponse: boolean;
  }>;
  episode: {
    turns: number;
    responsesWithAssistance: number;
    finalStatus: AnswerStatus | null;
    parentSummary: string | null;
  };
};
