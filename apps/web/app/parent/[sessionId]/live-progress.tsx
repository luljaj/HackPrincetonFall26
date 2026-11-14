"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToSession } from "../../../lib/parent/subscribe";
import type { SessionProgress } from "../../../lib/parent/types";
import { SessionView } from "../_components/session-view";
import { ErrorState } from "../_components/states";

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
      {error && <ErrorState message={error} />}
      <SessionView progress={progress} />
    </div>
  );
}
