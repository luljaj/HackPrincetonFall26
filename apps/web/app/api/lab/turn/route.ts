import { z } from "zod";
import { publishLive } from "../../../../lib/live/publish";

export const runtime = "nodejs";

const short = z.string().trim().max(200).optional();
// What the lab is doing at a pause. Deliberately nothing the child said: no transcripts here.
const LabTurn = z.strictObject({
  sessionId: z.string().regex(/^lab-[\w-]{8,64}$/),
  spotId: z.string().max(40),
  stage: z.string().max(40),
  question: short,
  outcome: z.enum(["correct", "wrong", "unclear", "silent"]).optional(),
  verdict: z.enum(["good", "close", "retry", "silent"]).optional(),
  skill: z.string().max(40).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  practiceWord: z.string().max(60).optional(),
});

// Lab turn → Convex live event for the parent's live view.
export async function POST(request: Request): Promise<Response> {
  const parsed = LabTurn.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid lab turn." }, { status: 400 });
  try {
    const sent = await publishLive({ kind: "lab_turn", ...parsed.data });
    return new Response(null, { status: sent ? 202 : 204 }); // 204: Convex not configured, nothing to do
  } catch {
    return Response.json({ error: "Live update failed." }, { status: 502 });
  }
}
