"use client";

import { useState } from "react";
import {
  FOCUS_LABEL,
  FOCUS_LEVELS,
  focusSummary,
  SUBJECTS,
  type Focus,
  type FocusLevel,
  type ParentPreferences,
  type SubjectId,
} from "../../../lib/parent/preferences";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Parent picks less / usual / more per subject. Saves on every click; change it any time.
export function FocusControls({ initial }: { initial: ParentPreferences }) {
  const [focus, setFocus] = useState<Focus>(initial.focus);
  const [status, setStatus] = useState<string | null>(
    initial.updatedAt ? `Saved ${time(initial.updatedAt)}` : null,
  );

  const choose = async (subject: SubjectId, level: FocusLevel) => {
    if (focus[subject] === level) return;
    const previous = focus;
    const next = { ...focus, [subject]: level };
    setFocus(next);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/parent/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const saved = (await res.json()) as ParentPreferences;
      setStatus(saved.updatedAt ? `Saved ${time(saved.updatedAt)}` : "Saved");
    } catch {
      setFocus(previous);
      setStatus("Couldn't save. Try again.");
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-labelledby="focus-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="focus-title" className="font-semibold">
          Learning focus
        </h2>
        <span role="status" className="text-xs text-foreground/60">
          {status}
        </span>
      </div>
      <ul className="grid gap-2">
        {SUBJECTS.map((s) => (
          <li key={s.id} className="grid grid-cols-[88px_1fr] items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: s.color }}>
              {s.name}
            </span>
            <div role="radiogroup" aria-label={`${s.name} focus`} className="flex gap-1">
              {FOCUS_LEVELS.map((level) => {
                const on = focus[s.id] === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => void choose(s.id, level)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      on ? "border-transparent text-white" : "border-line text-foreground/70 hover:bg-foreground/5"
                    }`}
                    style={on ? { background: s.color } : undefined}
                  >
                    {FOCUS_LABEL[level]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-foreground/70">{focusSummary(focus)} Change it any time.</p>
    </section>
  );
}
