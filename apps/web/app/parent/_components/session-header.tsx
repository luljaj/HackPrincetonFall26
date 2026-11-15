"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { showFor } from "../../../lib/parent/shows";
import type { ParentView } from "../../../lib/parent/types";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** What's going on in this session right now, from saved state only (no playback claims). */
function statusLine(view: ParentView, childName: string): string {
  const { activeQuestion, interactions } = view.progress;
  if (activeQuestion && interactions.length > 0) return `Dora asked a follow-up · waiting for ${childName}'s answer`;
  if (activeQuestion) return `Dora's question is ready · waiting for ${childName}'s first answer`;
  if (interactions.length > 0) {
    return `Learning moment finished · ${interactions.length} answer${interactions.length === 1 ? "" : "s"}`;
  }
  return "No questions yet";
}

export function SessionHeader({
  view,
  childName,
  live = false,
}: {
  view: ParentView;
  childName: string;
  live?: boolean;
}) {
  const show = showFor(view.sceneId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const waiting = view.progress.activeQuestion !== null;

  return (
    <header className="space-y-3">
      <Link className="text-sm text-foreground/60 underline" href="/parent">
        ← All sessions
      </Link>
      <div
        className="space-y-2 rounded-2xl border border-l-[6px] border-line bg-card px-5 py-4"
        style={{ borderLeftColor: show.color }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em]">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-background">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${waiting ? "bg-attention motion-safe:animate-pulse" : "bg-good"}`}
              />
              {waiting ? "Live now" : "Latest session"}
            </span>
          ) : (
            <span className="text-foreground/60">Session</span>
          )}
          {view.isSample && (
            <span className="rounded border border-foreground/30 px-1.5 py-0.5 normal-case tracking-normal">
              Sample data
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold">
          <span style={{ color: show.color }}>{show.show}</span>
          {show.episode && <span className="text-foreground/60"> · {show.episode}</span>}
        </h1>
        <p className="text-sm text-foreground/70">
          Started {clock(view.startedAt)}{" "}
          <span suppressHydrationWarning>· {ago(view.startedAt, now)}</span>
        </p>
        <p className="text-[15px] font-medium">{statusLine(view, childName)}</p>
        <p className="text-sm text-foreground/60">
          Learning goal: <span className="text-foreground">{view.progress.objective}</span>
        </p>
      </div>
    </header>
  );
}
