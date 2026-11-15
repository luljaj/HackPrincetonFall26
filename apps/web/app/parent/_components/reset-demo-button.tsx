"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-muted-foreground">Demo tools</span>
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        Reset demo
      </Button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
