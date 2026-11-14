import { randomUUID } from "node:crypto";
import { UuidSchema } from "../../lib/contracts/scene";
import { CreateSessionRequestSchema, TurnRequestMetadataSchema } from "../../lib/contracts/turn";
import { validateAudio } from "./audio";
import { PipelineError, withStore } from "./errors";
import { createSession } from "./session";
import { processTurn } from "./process-turn";
import { debugEnabled, traceKey, type PipelineRuntime } from "./runtime-core";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  const safe = error instanceof PipelineError ? error : new PipelineError("PROVIDER_ERROR");
  return json({ error: { code: safe.code, message: safe.message, requestId: randomUUID() } }, safe.status);
}
const invalid = () => new PipelineError("INVALID_REQUEST");

/** A quick container check, not a decoder. Provider decoding is still required. */
export async function validateContainer(audio: File) {
  validateAudio(audio);
  const bytes = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const extension = audio.name.split(".").at(-1)?.toLowerCase();
  const valid = extension === "webm" ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : extension === "wav" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
    : bytes.length >= 12 && ascii(4, 8) === "ftyp";
  if (!valid) throw new PipelineError("UNSUPPORTED_AUDIO");
}

export function createHttpHandlers(getRuntime: () => PipelineRuntime, env: Readonly<Record<string, string | undefined>>) {
  return {
    async create(request: Request) {
      try {
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw invalid();
        let body: unknown;
        try { body = await request.json(); } catch { throw invalid(); }
        const parsed = CreateSessionRequestSchema.safeParse(body);
        if (!parsed.success) throw invalid();
        return json(await createSession(parsed.data, getRuntime().session), 201);
      } catch (error) { return failure(error); }
    },
    async turn(request: Request, sessionId: string) {
      const started = performance.now();
      try {
        if (!UuidSchema.safeParse(sessionId).success || !request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw invalid();
        let data: FormData;
        try { data = await request.formData(); } catch { throw invalid(); }
        const fields = ["interactionId", "questionId", "expectedTurnNumber", "audio"];
        for (const key of data.keys()) if (!fields.includes(key)) throw invalid();
        for (const key of fields) if (data.getAll(key).length !== 1) throw invalid();
        const rawTurn = data.get("expectedTurnNumber");
        if (typeof rawTurn !== "string" || !/^(0|[1-9]\d*)$/.test(rawTurn) || !Number.isSafeInteger(Number(rawTurn))) throw invalid();
        const metadata = TurnRequestMetadataSchema.safeParse({ interactionId: data.get("interactionId"), questionId: data.get("questionId"), expectedTurnNumber: Number(rawTurn) });
        if (!metadata.success) throw invalid();
        const audio = data.get("audio");
        if (!(audio instanceof File)) throw invalid();
        await validateContainer(audio);
        const runtime = getRuntime();
        const response = await processTurn({ sessionId, metadata: metadata.data, audio }, runtime.pipeline);
        if (debugEnabled(env)) runtime.httpTimings.set(traceKey(sessionId, metadata.data.interactionId), performance.now() - started);
        return json(response);
      } catch (error) { return failure(error); }
    },
    async debug(request: Request, sessionId: string) {
      if (!debugEnabled(env)) return new Response(null, { status: 404 });
      try {
        const url = new URL(request.url);
        const entries = [...url.searchParams.entries()];
        const interactionId = url.searchParams.get("interactionId");
        if (!UuidSchema.safeParse(sessionId).success || entries.length > 1 || entries.some(([key]) => key !== "interactionId") || (interactionId !== null && !UuidSchema.safeParse(interactionId).success)) throw invalid();
        const runtime = getRuntime();
        const session = await withStore(() => runtime.session.store.loadSession(sessionId));
        if (!session) throw new PipelineError("SESSION_NOT_FOUND");
        const record = interactionId ? session.interactions.find((item) => item.interactionId === interactionId) ?? null : null;
        const key = interactionId ? traceKey(sessionId, interactionId) : "";
        return json({ session, record, trace: runtime.traces.get(key) ?? null, httpTotalMs: runtime.httpTimings.get(key) ?? null });
      } catch (error) { return failure(error); }
    },
  };
}
