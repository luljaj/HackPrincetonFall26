"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={busy}>
        {busy ? "Deleting…" : "Delete this session"}
      </Button>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
