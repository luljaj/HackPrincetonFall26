// Pre-written at-home suggestions, keyed by objective ID (learning-progress-plan.md §8.5).
// Authored content — no model call.
const NEXT_STEPS: Record<string, string> = {
  "sample-counting": "Try counting toys together at bedtime, touching each one as you count.",
};

export function nextStepFor(objectiveId: string): string | null {
  return NEXT_STEPS[objectiveId] ?? null;
}
