// The only file that knows the realtime transport (learning-progress-plan.md §2, §9).
// Realtime ownership/hosting isn't decided yet, so this stub just fires a resync on a timer.
// When the WebSocket service exists, call onChange() for each session-update notification here,
// and keep a slow resync as the fallback for missed events.

export type SessionChange = { interactionId: string | null; turnNumber: number | null };

const RESYNC_MS = 2000;

export function subscribeToSession(
  sessionId: string,
  onChange: (change: SessionChange) => void,
): () => void {
  void sessionId; // used by the real transport to pick the channel
  const tick = () => {
    if (document.visibilityState === "visible") {
      onChange({ interactionId: null, turnNumber: null });
    }
  };
  const timer = setInterval(tick, RESYNC_MS);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}
