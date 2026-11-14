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
