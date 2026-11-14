export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (
    typeof body !== "object" || body === null || !("text" in body) ||
    typeof body.text !== "string" || !body.text.trim() || body.text.trim().length > 600
  ) {
    return Response.json({ error: "Text must contain 1–600 characters." }, { status: 400 });
  }
  try {
    const upstream = await fetch("http://127.0.0.1:8766/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body.text.trim() }),
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
