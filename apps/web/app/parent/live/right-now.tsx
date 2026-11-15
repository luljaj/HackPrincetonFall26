"use client";

import { useEffect, useState } from "react";
import { subscribeToLiveEvents, type LiveEventView } from "../../../lib/parent/subscribe";
import { Chip } from "../_components/chip";

const LANGUAGE: Record<string, string> = { es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };
const STAGE: Record<string, string> = {
  asking: "Dora is asking", listening: "Listening for an answer", thinking: "Thinking about the answer",
  celebrating: "Celebrating", teaching: "Giving a clue", modeling: "Saying it together", giving: "Showing the answer",
  clarifying: "Asking again", nudging: "Encouraging", practicing: "Practising a new word", watching: "Back to the show",
};
const OUTCOME = { correct: ["Got it", "good"], wrong: ["Not yet", "warn"], unclear: ["Didn't catch it", "muted"], silent: ["No answer", "muted"] } as const;

// What's happening in the cartoon right now, pushed live over Convex. Shows nothing without a live transport.
export function RightNow() {
  const [events, setEvents] = useState<LiveEventView[] | null>(null);
  useEffect(() => subscribeToLiveEvents((e) => setEvents(e.filter((x) => x.kind === "lab_turn"))) ?? undefined, []);
  const now = events?.[0];
  if (!now) return null;
  const outcome = now.outcome ? OUTCOME[now.outcome as keyof typeof OUTCOME] : null;
  return (
    <section className="rounded-xl border border-foreground/10 p-4 space-y-2" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
        Right now <span className="ml-1 inline-block h-2 w-2 rounded-full bg-good align-middle" aria-hidden />
      </p>
      <p className="font-semibold">
        {STAGE[now.stage ?? ""] ?? now.stage}
        {outcome && <Chip tone={outcome[1]}>{outcome[0]}</Chip>}
        {now.skill && <Chip tone="muted">{now.skill}</Chip>}
      </p>
      {now.question && <p className="text-foreground/80">“{now.question}”</p>}
      {now.language && now.practiceWord && (
        <p className="text-sm text-foreground/70">Learning {LANGUAGE[now.language] ?? now.language}: <b>{now.practiceWord}</b></p>
      )}
    </section>
  );
}
