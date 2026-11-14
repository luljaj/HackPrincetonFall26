"use client";

import { useState } from "react";
import { CreateSessionResponseSchema, TurnResponseSchema, type CreateSessionResponse, type TurnResponse, type TurnRequestMetadata } from "../../../lib/contracts/turn";

type Submission = { sessionId: string; metadata: TurnRequestMetadata; file: File };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
async function read(response: Response): Promise<unknown> {
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(pretty(result));
  return result;
}

export default function PipelineInspector() {
  const [session, setSession] = useState<CreateSessionResponse | null>(null);
  const [current, setCurrent] = useState<TurnResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [last, setLast] = useState<Submission | null>(null);
  const [selected, setSelected] = useState<TurnResponse | null>(null);
  const [debug, setDebug] = useState<unknown>(null);
  const [roundtrip, setRoundtrip] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const question = current ? current.response.nextQuestion : session?.question;

  async function inspect(sessionId: string, interactionId?: string) {
    const query = interactionId ? `?interactionId=${interactionId}` : "";
    setDebug(await read(await fetch(`/api/dev/pipeline/${sessionId}${query}`, { cache: "no-store" })));
  }
  async function newSession() {
    setBusy(true); setError("");
    try {
      const result = CreateSessionResponseSchema.parse(await read(await fetch("/api/learning/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneId: "demo-scene" }),
      })));
      setSession(result); setCurrent(null); setSelected(null); setLast(null); setRoundtrip(null); setDebug(null);
      await inspect(result.sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); }
    finally { setBusy(false); }
  }
  async function submit(retry: boolean) {
    const submission: Submission | null = retry ? last : session && question && file ? {
      sessionId: session.sessionId, file,
      metadata: { interactionId: crypto.randomUUID(), questionId: question.questionId, expectedTurnNumber: current?.turnNumber ?? 0 },
    } : null;
    if (!submission) return;
    setLast(submission); setBusy(true); setError("");
    try {
      const data = new FormData();
      for (const [key, value] of Object.entries(submission.metadata)) data.append(key, String(value));
      data.append("audio", submission.file);
      const started = performance.now();
      const result = TurnResponseSchema.parse(await read(await fetch(`/api/learning/sessions/${submission.sessionId}/turns`, { method: "POST", body: data })));
      setRoundtrip(performance.now() - started); setSelected(result); setCurrent(result);
      await inspect(submission.sessionId, submission.metadata.interactionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 960, margin: "32px auto", padding: 24, lineHeight: 1.6 }}>
    <h1>Pipeline inspector</h1>
    <p>Local synthetic development data. Memory is lost when the server restarts. Upload a short, deliberately recorded test answer (maximum 3 MiB).</p>
    <form onSubmit={(event) => { event.preventDefault(); void newSession(); }}>
      <label htmlFor="scene">Scene </label>
      <select id="scene" disabled={busy}><option value="demo-scene">Demo scene — count apples (synthetic)</option></select>{" "}
      <button disabled={busy} type="submit">New session</button>
    </form>
    <p>Session: {session?.sessionId ?? "Create a session to begin."}</p>
    <p>Current question: {question?.text ?? (session ? "Teaching moment finished." : "—")}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
      <label htmlFor="audio">Audio file </label>
      <input id="audio" type="file" accept=".webm,.mp4,.m4a,.wav" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{" "}
      <button type="submit" disabled={busy || !session || !question || !file}>Submit new answer</button>{" "}
      <button type="button" disabled={busy || !last} onClick={() => void submit(true)}>Retry exact last submission</button>
    </form>
    <p>Retry retains the same interaction ID, metadata and original File even after choosing another file. A new submission creates a new interaction ID. Keep one request in flight.</p>
    <p aria-live="polite">{busy ? "Processing…" : "Ready"}</p>
    {error && <pre role="alert" style={{ whiteSpace: "pre-wrap" }}>{error}</pre>}
    <h2>Last submission</h2>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pretty(last && { sessionId: last.sessionId, ...last.metadata, filename: last.file.name, bytes: last.file.size })}</pre>
    <h2>Selected response</h2>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pretty(selected)}</pre>
    <p>Client round-trip: {roundtrip === null ? "—" : `${roundtrip.toFixed(1)} ms`} (upload and response; debug refetch excluded).</p>
    <h2>Stored readback and private context</h2>
    <p>Session includes the exact scene and private current question. Record includes transcript, final assessment, parent summary, Luna draft and model-stage timings. A null Luna duration/draft means that stage was skipped. Trace adds persistence and pipeline-total time; httpTotalMs includes request parsing. On replay the trace remains from the original commit, while httpTotalMs measures the latest request.</p>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pretty(debug)}</pre>
  </main>;
}
