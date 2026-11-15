"use client";

import { highlightTone } from "../../../lib/parent/highlight";
import type { ParentView } from "../../../lib/parent/types";
import { assessmentWording } from "../../../lib/parent/wording";
import { ActiveQuestion } from "./active-question";
import { InteractionCard } from "./interaction-card";
import { NextStep } from "./next-step";
import { ParentSummary } from "./parent-summary";
import { PANEL } from "./panel";
import { SessionHeader } from "./session-header";
import { EmptyState } from "./states";
import { useFreshAnswers } from "./use-fresh-answers";

// Presentational view of one session. Used by the session page and the live demo page.
export function SessionView({ view, childName }: { view: ParentView; childName?: string }) {
  const { progress } = view;
  const hasAnswers = progress.interactions.length > 0;
  const fresh = useFreshAnswers(progress.interactions);
  const newest = [...progress.interactions].reverse().find((i) => fresh.has(i.interactionId));

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      {/* Screen readers hear about a new answer the same way sighted viewers see the highlight. */}
      <p className="sr-only" role="status" aria-live="polite">
        {newest ? `New answer: ${assessmentWording(newest.assessment)}.` : ""}
      </p>
      <SessionHeader objective={progress.objective} isSample={view.isSample} />
      {/* Answers sit as tiles on the big grey panel, like the insights panel on the home page. */}
      {(hasAnswers || progress.activeQuestion) && (
        <div className={`${PANEL} flex flex-col gap-3`}>
          {hasAnswers && <ParentSummary episode={progress.episode} />}
          {hasAnswers && (
            <ol className="flex flex-col gap-3">
          {progress.interactions.map((i) => (
            <li key={i.interactionId}>
              <InteractionCard
                interaction={i}
                childName={childName}
                highlight={
                  fresh.has(i.interactionId) ? highlightTone(i.assessment.answerStatus) : null
                }
              />
            </li>
          ))}
            </ol>
          )}
          <ActiveQuestion question={progress.activeQuestion} hasAnswers={hasAnswers} />
          {hasAnswers && !progress.activeQuestion && <NextStep objectiveId={view.objectiveId} />}
        </div>
      )}
      {!hasAnswers && !progress.activeQuestion && <EmptyState />}
    </div>
  );
}
