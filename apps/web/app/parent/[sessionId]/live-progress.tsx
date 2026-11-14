"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToSession } from "../../../lib/parent/subscribe";
import type { ParentView } from "../../../lib/parent/types";
import { SessionView } from "../_components/session-view";
import { ErrorState } from "../_components/states";

export function LiveProgress({ initial, childName }: { initial: ParentView; childName: string }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const latestTurns = useRef(initial.progress.episode.turns);
  const requestSeq = useRef(0);
  const sessionId = initial.progress.sessionId;

  useEffect(() => {
    const refetch = async () => {
      const seq = ++requestSeq.current;
      try {
        const res = await fetch(`/api/parent/sessions/${sessionId}/progress`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as ParentView;
        // Drop out-of-order responses and anything older than what's on screen.
        if (seq !== requestSeq.current || next.progress.episode.turns < latestTurns.current) return;
        latestTurns.current = next.progress.episode.turns;
        setView(next);
        setError(null);
      } catch {
        setError("Couldn't refresh right now.");
      }
    };
    void refetch(); // resync on connect
    return subscribeToSession(sessionId, (change) => {
      if (change.turnNumber !== null && change.turnNumber <= latestTurns.current) return;
      void refetch();
    });
  }, [sessionId]);

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      <SessionView view={view} childName={childName} />
    </div>
  );
}
