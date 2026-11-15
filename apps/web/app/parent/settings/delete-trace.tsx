"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// sessionId: delete one trace. No sessionId: delete every trace.
export function DeleteTrace({ sessionId, label }: { sessionId?: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const what = sessionId ? "this viewing's trace (every pause, answer and transcript)" : "every viewing's trace";
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(sessionId ? `/api/parent/sessions/${sessionId}` : "/api/parent/play", { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Couldn't delete. Try again.");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          sessionId ? "border border-line text-foreground/70 hover:bg-foreground/5" : "bg-[#c2410c] text-white hover:bg-[#9a3412]"
        }`}
      >
        {busy ? "Deleting…" : label}
      </button>
      {error && <span className="text-xs text-warn">{error}</span>}
    </span>
  );
}
