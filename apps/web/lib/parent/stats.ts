import type { ParentView } from "./types";
import type { ParentStats } from "./wording";

// Plain counts across the listed sessions (no scores or percentages). Sample sessions are left
// out whenever any real session exists, so demo numbers never mix with seeded data.
export function parentStats(views: readonly ParentView[]): ParentStats {
  const real = views.filter((v) => !v.isSample);
  const counted = real.length > 0 ? real : views;
  const turns = counted.flatMap((v) => v.progress.interactions);
  return {
    sessions: counted.length,
    answered: turns.filter(
      (t) => t.assessment.answerStatus === "correct" || t.assessment.answerStatus === "incorrect",
    ).length,
    correctAfterHelp: turns.filter(
      (t) => t.assessment.answerStatus === "correct" && t.assessment.assistanceBeforeAnswer,
    ).length,
  };
}
