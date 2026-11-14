"use client";

import { useState } from "react";

// Dev/demo only: rendered only when DEMO_TOOLS=true.
export function ResetDemoButton({ onReset }: { onReset?: () => void }) {
  const [status, setStatus] = useState<string | null>(null);

  const onClick = async () => {
    if (!window.confirm("Reset the demo? This deletes every non-sample session.")) return;
    setStatus("Resetting…");
    const res = await fetch("/api/parent/demo/reset", { method: "POST" });
    if (res.ok) {
      const { removed } = (await res.json()) as { removed: number };
      setStatus(`Reset. Removed ${removed} session${removed === 1 ? "" : "s"}.`);
      onReset?.();
    } else {
      setStatus("Reset failed.");
    }
  };

  return (
    <div className="flex items-center gap-3 rounded border border-dashed border-foreground/30 p-3 text-sm">
      <span className="text-foreground/60">Demo tools</span>
      <button type="button" onClick={onClick} className="rounded border border-foreground/30 px-3 py-1">
        Reset demo
      </button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
