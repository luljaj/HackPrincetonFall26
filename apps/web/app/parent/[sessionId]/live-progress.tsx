"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToSession } from "../../../lib/parent/subscribe";
import type { SessionProgress } from "../../../lib/parent/types";
import { InteractionCard } from "../_components/interaction-card";
import { NextStep } from "../_components/next-step";
import { ParentSummary } from "../_components/parent-summary";
import { SessionHeader } from "../_components/session-header";
import { EmptyState, ErrorState } from "../_components/states";

export function LiveProgress({ initial }: { initial: SessionProgress }) {
  const [progress, setProgress] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const latestTurns = useRef(initial.episode.turns);
  const requestSeq = useRef(0);

  useEffect(() => {
    const refetch = async () => {
      const seq = ++requestSeq.current;
      try {
        const res = await fetch(`/api/parent/sessions/${initial.sessionId}/progress`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as SessionProgress;
        // Drop out-of-order responses and anything older than what's on screen.
        if (seq !== requestSeq.current || next.episode.turns < latestTurns.current) return;
        latestTurns.current = next.episode.turns;
        setProgress(next);
        setError(null);
      } catch {
        setError("Couldn't refresh right now.");
      }
    };
    void refetch(); // resync on connect
    return subscribeToSession(initial.sessionId, (change) => {
      if (change.turnNumber !== null && change.turnNumber <= latestTurns.current) return;
      void refetch();
    });
  }, [initial.sessionId]);

  return (
    <div className="space-y-6">
      <SessionHeader objective={progress.objective} isSample={progress.isSample} />
      {error && <ErrorState message={error} />}
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
