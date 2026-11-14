import { hasParentAccess } from "../../../../../../lib/parent/access";
import { getParentViewReader } from "../../../../../../lib/parent/reader";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { sessionId } = await params;
  const view = await getParentViewReader().getParentView(sessionId);
  if (!view) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // view.progress has already passed the strict shared SessionProgressSchema.
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
