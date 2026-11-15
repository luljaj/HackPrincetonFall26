"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
const Result = z.object({ source: z.enum(["luna", "saved-data"]), evidenceCount: z.number(), summary: z.string(), pattern: z.string(), nextStep: z.string(), uncertainty: z.string() });
export function LearningAnalysis({ subject, version }: { subject: string; version: string }) {
  const [result, setResult] = useState<z.infer<typeof Result> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false); setResult(null);
    void fetch(`/api/parent/analysis?subject=${encodeURIComponent(subject)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const parsed = Result.parse(await response.json());
      if (!controller.signal.aborted) setResult(parsed);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [subject, version]);
  return <section className="learning-analysis" aria-label="Learning analysis">
    <h4>{result?.source === "luna" ? "Luna’s learning analysis" : "Learning evidence"}</h4>
    {error ? <p>Luna’s analysis is temporarily unavailable. Saved progress above is still current.</p> : !result ? <p role="status">Luna is reading the saved answers…</p> : <>
      <p>{result.summary}</p>{result.pattern && <p>{result.pattern}</p>}<p><b>Next:</b> {result.nextStep}</p>
      <small>{result.evidenceCount} saved assessed answers. {result.uncertainty}</small>
    </>}
  </section>;
}
