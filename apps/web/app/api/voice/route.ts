import { z } from "zod";

export const runtime = "nodejs";

const speechRequest = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.enum(["en", "es", "fr", "de", "zh", "hi", "ja"]).default("en"),
  learningLanguage: z.enum(["en", "es", "fr", "de", "zh", "hi", "ja"]).optional(),
  durationSeconds: z.number().positive().max(60).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = speechRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide 1–600 characters, a supported language and a valid dub duration." }, { status: 400 });
  const priority = z.enum(["live", "prepare", "dub"]).safeParse(request.headers.get("X-Voice-Priority") ?? "live");
  if (!priority.success) return Response.json({ error: "Invalid speech priority." }, { status: 400 });
  try {
    const upstream = await fetch("http://127.0.0.1:8766/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Voice-Priority": priority.data },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json({ error: "Local voice service is unavailable. Start tools/voice-server.py." }, { status: 503 });
  }
}
