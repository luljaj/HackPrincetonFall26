import { getPlan, PlanPatchSchema, setPlan } from "../../../../lib/live/plan";
import { hasParentAccess } from "../../../../lib/parent/access";
import { getPreferencesStore } from "../../../../server/storage";

export const dynamic = "force-dynamic";

// The live learning plan (learning-plan.md). GET: current plan. PUT { language?, focus? }: change it; the
// kid view picks it up within a second. Focus is also saved to Postgres, which stays its record.
export async function GET() {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await getPlan(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PlanPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_plan" }, { status: 400 });
  if (parsed.data.focus) await getPreferencesStore().set(parsed.data.focus);
  try {
    if (!(await setPlan(parsed.data))) return Response.json({ error: "Live updates aren't configured." }, { status: 503 });
  } catch {
    return Response.json({ error: "Couldn't reach the live plan." }, { status: 502 });
  }
  return Response.json(await getPlan());
}
