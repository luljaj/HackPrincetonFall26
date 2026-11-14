// Parent-facing types. The progress payload is Luka's shared contract (lib/contracts/progress.ts);
// the dashboard only adds two display fields around it instead of changing that schema.
import type { LearningAssessment, PublicQuestion, SessionProgress } from "../contracts";

export type { LearningAssessment, PublicQuestion, SessionProgress };
export type AnswerStatus = LearningAssessment["answerStatus"];

export type ProgressInteraction = SessionProgress["interactions"][number];

/** What the parent API returns: the shared progress payload plus dashboard-only display data. */
export type ParentView = {
  progress: SessionProgress;
  objectiveId: string; // keys the pre-written "Try at home" tip
  isSample: boolean; // drives the "Sample data" badge
};
