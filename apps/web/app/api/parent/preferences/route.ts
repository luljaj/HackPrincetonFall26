import { hasParentAccess } from "../../../../lib/parent/access";
import { FocusSchema } from "../../../../lib/parent/preferences";
import { getPreferencesStore } from "../../../../server/storage";

export const dynamic = "force-dynamic";

// GET: current learning focus (Play mode can read this to choose more moments in a subject).
export async function GET() {
  return Response.json(await getPreferencesStore().get(), {
    headers: { "Cache-Control": "no-store" },
  });
}

// PUT { focus: { math, english, science } }: parent changes the focus. Any time, any number of times.
export async function PUT(request: Request) {
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { focus?: unknown } | null;
  const parsed = FocusSchema.safeParse(body?.focus);
  if (!parsed.success) {
    return Response.json({ error: "invalid_focus" }, { status: 400 });
  }
  return Response.json(await getPreferencesStore().set(parsed.data));
}
