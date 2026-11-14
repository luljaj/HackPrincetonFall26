import type { AnswerStatus, LearningAssessment } from "./types";

// The only place dashboard claim wording lives (learning-progress-plan.md §3).
// No mastery, no hint counts, no claims that the child heard a response.

export function assessmentWording(a: LearningAssessment): string {
  switch (a.answerStatus) {
    case "correct":
      return a.assistanceBeforeAnswer
        ? "Answered correctly after assistance"
        : "Answered correctly before assistance was recorded";
    case "incorrect":
      return "This answer was assessed as incorrect";
    case "unclear":
      return "The answer was unclear";
    case "off_topic":
      return "The answer was off-topic";
    case "not_assessed":
      return "Not assessed";
  }
}

export function statusLabel(status: AnswerStatus | null): string {
  switch (status) {
    case null:
      return "No answers yet";
    case "correct":
      return "Correct";
    case "incorrect":
      return "Incorrect";
    case "unclear":
      return "Unclear";
    case "off_topic":
      return "Off-topic";
    case "not_assessed":
      return "Not assessed";
  }
}

export function assistanceCountWording(n: number): string {
  return n === 1 ? "1 response with assistance" : `${n} responses with assistance`;
}

export function misconceptionWording(m: string): string {
  return `This answer might mean the child ${m}. It's a guess from one answer, not a diagnosis.`;
}

// Short chips from the apps/parent mock, kept to the same claim limits.
export type ChipTone = "good" | "warn" | "muted";

export function statusChip(status: AnswerStatus): { label: string; tone: ChipTone } {
  switch (status) {
    case "correct":
      return { label: "Correct", tone: "good" };
    case "incorrect":
      return { label: "Not yet", tone: "warn" };
    case "unclear":
      return { label: "Unclear", tone: "muted" };
    case "off_topic":
      return { label: "Off topic", tone: "muted" };
    case "not_assessed":
      return { label: "Didn't hear", tone: "muted" };
  }
}

/** "after a hint" in the mock; assistance can be a hint, an explanation or the answer itself. */
export const AFTER_HELP_CHIP = "after help";

export type ParentStats = { sessions: number; answered: number; correctAfterHelp: number };

export function statsLabels(): Record<keyof ParentStats, string> {
  return {
    sessions: "episodes watched",
    answered: "questions answered",
    correctAfterHelp: "answered after help",
  };
}

export const SNAPSHOT_NOTE =
  "Each card shows what happened in one episode. A single answer is a snapshot, not a measure of mastery.";
