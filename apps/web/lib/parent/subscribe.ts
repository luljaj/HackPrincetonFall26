// The only file that knows the realtime transport (learning-progress-plan.md §2, §9).
// Transport: Convex, used only for live notifications (Postgres stays the record). Each event says
// *that* something changed; the dashboard then refetches its own authorised view. A slow resync stays as
// the fallback for missed events, and without NEXT_PUBLIC_CONVEX_URL it falls back to 2 s polling.

import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

export type SessionChange = { interactionId: string | null; turnNumber: number | null };

const POLL_MS = 2000; // no Convex configured
const RESYNC_MS = 15000; // with Convex: safety net only

let client: ConvexClient | null = null;
const convex = () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? (client ??= new ConvexClient(url)) : null;
};

export function subscribeToSession(
  sessionId: string, // "live" = whatever is newest
  onChange: (change: SessionChange) => void,
): () => void {
  const tick = () => {
    if (document.visibilityState === "visible") onChange({ interactionId: null, turnNumber: null });
  };
  const c = convex();
  let lastSeen: number | null = null;
  const stop = c
    ? c.onUpdate(sessionId === "live" ? api.live.latest : api.live.forSession, sessionId === "live" ? {} : { sessionId }, (events) => {
        const newest = events[0];
        if (!newest || newest.at === lastSeen) return;
        const first = lastSeen === null;
        lastSeen = newest.at;
        if (!first) onChange({ interactionId: newest.interactionId ?? null, turnNumber: newest.turnNumber ?? null });
      })
    : () => {};
  const timer = setInterval(tick, c ? RESYNC_MS : POLL_MS);
  document.addEventListener("visibilitychange", tick);
  return () => {
    stop();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}

export type LiveEventView = {
  kind: "lab_turn" | "session_updated"; at: number; stage?: string; question?: string; outcome?: string;
  verdict?: string; skill?: string; language?: string; practiceWord?: string;
};

/** Newest live events (what's happening right now). Returns null when no live transport is configured. */
export function subscribeToLiveEvents(onEvents: (events: LiveEventView[]) => void): (() => void) | null {
  const c = convex();
  return c ? c.onUpdate(api.live.latest, {}, (events) => onEvents(events)) : null;
}

export type LivePlan = { language?: string; focus?: Record<string, string>; updatedAt: number };

/** The parent's learning plan (learning-plan.md), every time it changes, including once on load. */
export function subscribeToPlan(onPlan: (plan: LivePlan) => void): (() => void) | null {
  const c = convex();
  return c ? c.onUpdate(api.plan.get, { learnerKey: "default" }, (plan) => plan && onPlan(plan)) : null;
}
