"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    if (!window.confirm("Delete this session's answers and summary? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/parent/sessions/${sessionId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/parent");
      router.refresh();
    } else {
      setError("Couldn't delete this session.");
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="rounded border border-foreground/30 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete this session"}
      </button>
      {error && <p className="text-sm">{error}</p>}
    </div>
  );
}
