import type { SessionProgress } from "../../../lib/parent/types";
import { InteractionCard } from "./interaction-card";
import { NextStep } from "./next-step";
import { ParentSummary } from "./parent-summary";
import { SessionHeader } from "./session-header";
import { EmptyState } from "./states";

// Presentational view of one session. Used by the session page and the live demo page.
export function SessionView({ progress }: { progress: SessionProgress }) {
  return (
    <div className="space-y-6">
      <SessionHeader objective={progress.objective} isSample={progress.isSample} />
      {progress.interactions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <ParentSummary episode={progress.episode} />
          <ol className="space-y-3">
            {progress.interactions.map((i) => (
              <li key={i.interactionId}>
                <InteractionCard interaction={i} />
              </li>
            ))}
          </ol>
          <NextStep objectiveId={progress.objectiveId} />
        </>
      )}
    </div>
  );
}
