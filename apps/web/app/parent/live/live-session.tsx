"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMPLE_SESSION_ID } from "../../../lib/parent/sample-id";
import { subscribeToSession } from "../../../lib/parent/subscribe";
import type { ParentView } from "../../../lib/parent/types";
import { ResetDemoButton } from "../_components/reset-demo-button";
import { SessionView } from "../_components/session-view";
import { ErrorState, LoadingState } from "../_components/states";

type Live = { view: ParentView | null };

export function LiveSession({ demoTools, childName }: { demoTools: boolean; childName: string }) {
  const [live, setLive] = useState<Live | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch("/api/parent/live", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as Live;
      if (seq !== requestSeq.current) return; // drop out-of-order responses
      setLive(next);
      setError(null);
    } catch {
      setError("Couldn't refresh right now.");
    }
  }, []);

  useEffect(() => {
    void refetch();
    // "live" is not a session ID; the stub just resyncs. A real transport would subscribe
    // to "new session" and "session updated" events here.
    return subscribeToSession("live", () => void refetch());
  }, [refetch]);

  return (
    <div className="space-y-6">
      {demoTools && <ResetDemoButton onReset={() => void refetch()} />}
      {error && <ErrorState message={error} />}
      {live === undefined ? (
        <LoadingState />
      ) : live.view ? (
        <SessionView key={live.view.progress.sessionId} view={live.view} childName={childName} live />
      ) : (
        <div className="space-y-2">
          <p className="text-foreground/70">Waiting for a session to start…</p>
          <Link className="text-sm underline" href={`/parent/${SAMPLE_SESSION_ID}`}>
            View sample session
          </Link>
        </div>
      )}
    </div>
  );
}
