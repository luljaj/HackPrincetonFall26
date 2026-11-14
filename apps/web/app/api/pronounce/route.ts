export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 2_000_000;

// Kid's clip + target word → local pronunciation scorer (tools/pronounce-server.py).
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const [word, language, ipa] = ["word", "language", "ipa"].map((k) => form?.get(k));
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES ||
      typeof word !== "string" || typeof language !== "string" || typeof ipa !== "string") {
    return Response.json({ error: "Send audio (up to 2 MB), word, language and ipa." }, { status: 400 });
  }
  try {
    const upstream = await fetch("http://127.0.0.1:8767/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, language, ipa, audio: Buffer.from(await audio.arrayBuffer()).toString("base64") }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      cache: "no-store",
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Pronunciation service is unavailable. Start tools/pronounce-server.py." }, { status: 503 });
  }
}
