"use client";

import { useEffect, useState } from "react";
import { DEMO_MODE_EVENT, DEMO_START_FOCUS, readDemoMode, writeDemoMode } from "../../../lib/parent/demo-mode";
import { FOCUS_EVENT, type FocusEventDetail } from "../../../lib/parent/preferences";

// Settings → Demo Mode. Saved in this browser only.
export function DemoModeToggle({ child }: { child: string }) {
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setOn(readDemoMode());
    const sync = (event: Event) => setOn((event as CustomEvent<boolean>).detail);
    window.addEventListener(DEMO_MODE_EVENT, sync);
    return () => window.removeEventListener(DEMO_MODE_EVENT, sync);
  }, []);

  async function toggle() {
    const next = !on;
    setOn(next);
    writeDemoMode(next);
    setNote(null);
    if (!next) return;
    // Start the demo from a balanced mix, so the Numbers dial has somewhere to go.
    try {
      const res = await fetch("/api/parent/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: DEMO_START_FOCUS }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(
        new CustomEvent<FocusEventDetail>(FOCUS_EVENT, { detail: { focus: DEMO_START_FOCUS, from: "companion" } }),
      );
      setNote("Learning focus reset to Usual for every subject.");
    } catch {
      setNote("Couldn't reset the learning focus. Demo Mode is still on.");
    }
  }

  return (
    <section className="space-y-3 rounded-[32px] bg-[#f9f9fb] p-6" aria-labelledby="demo-mode-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="demo-mode-title" className="text-[19px] tracking-tight">
            Demo Mode
          </h2>
          <p className="max-w-[460px] text-sm text-foreground/60">
            Commands like &ldquo;Make {child} learn more about addition&rdquo;, &ldquo;Switch to Spanish&rdquo; and
            &ldquo;Reset the current skill&rdquo; update the real lesson without waiting for the chat model.
            Other questions still go to the model. Saved in this browser only.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="demo-mode-title"
          onClick={() => void toggle()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-[#3949f4]" : "bg-foreground/15"}`}
        >
          <span
            className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`}
          />
        </button>
      </div>
      {note && (
        <p role="status" className="text-xs text-foreground/60">
          {note}
        </p>
      )}
    </section>
  );
}
