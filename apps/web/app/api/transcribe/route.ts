export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 2_000_000;
const LANGUAGE = /^[a-z]{2,3}$/;

// Kid's spoken answer → local Whisper (tools/pronounce-server.py), primed with the expected answers.
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const hint = form?.get("hint") ?? "";
  const languages = (form?.getAll("languages") ?? []).filter((l): l is string => typeof l === "string" && LANGUAGE.test(l));
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || typeof hint !== "string" || languages.length === 0) {
    return Response.json({ error: "Send audio (up to 2 MB), a hint and at least one language." }, { status: 400 });
  }
  try {
    const upstream = await fetch("http://127.0.0.1:8767/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: Buffer.from(await audio.arrayBuffer()).toString("base64"), hint: hint.slice(0, 300), languages: languages.slice(0, 4) }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      cache: "no-store",
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Listening service is unavailable. Start tools/pronounce-server.py." }, { status: 503 });
  }
}
