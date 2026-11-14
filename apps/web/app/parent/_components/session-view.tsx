import type { ParentView } from "../../../lib/parent/types";
import { ActiveQuestion } from "./active-question";
import { InteractionCard } from "./interaction-card";
import { NextStep } from "./next-step";
import { ParentSummary } from "./parent-summary";
import { SessionHeader } from "./session-header";
import { EmptyState } from "./states";

// Presentational view of one session. Used by the session page and the live demo page.
export function SessionView({ view }: { view: ParentView }) {
  const { progress } = view;
  const hasAnswers = progress.interactions.length > 0;
  return (
    <div className="space-y-6">
      <SessionHeader objective={progress.objective} isSample={view.isSample} />
      {hasAnswers && <ParentSummary episode={progress.episode} />}
      {hasAnswers && (
        <ol className="space-y-3">
          {progress.interactions.map((i) => (
            <li key={i.interactionId}>
              <InteractionCard interaction={i} />
            </li>
          ))}
        </ol>
      )}
      <ActiveQuestion question={progress.activeQuestion} hasAnswers={hasAnswers} />
      {!hasAnswers && !progress.activeQuestion && <EmptyState />}
      {hasAnswers && !progress.activeQuestion && <NextStep objectiveId={view.objectiveId} />}
    </div>
  );
}
