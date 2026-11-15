import { publishLive } from "../../../../lib/live/publish";
import { PlayBatchSchema } from "../../../../lib/play/trace";
import { getPlayStore } from "../../../../server/storage";

export const runtime = "nodejs";

// Play mode's session trace. Postgres (or memory) first: it's the record. Then a Convex ping so an
// open parent dashboard refetches; the ping carries no transcript, only "this session changed".
export async function POST(request: Request): Promise<Response> {
  // sendBeacon posts text/plain, so parse the body ourselves either way.
  const body = await request.text().then((t) => JSON.parse(t)).catch(() => null);
  const parsed = PlayBatchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid play events." }, { status: 400 });
  let record;
  try {
    record = await getPlayStore().ingest(parsed.data);
  } catch (e) {
    console.error("play events: save failed", e);
    return Response.json({ error: "Could not save play events." }, { status: 503 });
  }
  await publishLive({ kind: "session_updated", sessionId: parsed.data.sessionId, turnNumber: record.turns.length }).catch(() => false);
  return Response.json({ turns: record.turns.length }, { status: 202 });
}
