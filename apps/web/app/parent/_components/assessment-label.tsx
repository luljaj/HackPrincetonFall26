import { assessmentWording } from "../../../lib/parent/wording";
import type { LearningAssessment } from "../../../lib/parent/types";

export function AssessmentLabel({ assessment }: { assessment: LearningAssessment }) {
  return (
    <p data-status={assessment.answerStatus} className="font-medium">
      {assessmentWording(assessment)}
    </p>
  );
}
