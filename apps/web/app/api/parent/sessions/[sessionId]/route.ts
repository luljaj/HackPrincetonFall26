import { hasParentAccess } from "../../../../../lib/parent/access";
import { getDemoAdmin } from "../../../../../server/storage";
import { SAMPLE_SESSION_ID } from "../../../../../lib/parent/sample-id";

export const dynamic = "force-dynamic";

// Parent deletes one session's evidence (learning-progress-plan.md §8.6).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { sessionId } = await params;
  if (sessionId === SAMPLE_SESSION_ID) {
    return Response.json({ error: "sample_is_read_only" }, { status: 403 });
  }
  const admin = getDemoAdmin();
  if (!admin) return Response.json({ error: "no_database" }, { status: 503 });
  const deleted = await admin.deleteSession(sessionId);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "not_found" }, { status: 404 });
}
