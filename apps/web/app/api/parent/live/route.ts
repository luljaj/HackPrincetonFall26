import { hasParentAccess } from "../../../../lib/parent/access";
import { getProgressReader } from "../../../../lib/parent/reader";
import { getDemoAdmin } from "../../../../server/storage";

export const dynamic = "force-dynamic";

// The live demo session: the newest non-sample session, or null while waiting for one.
export async function GET() {
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = getDemoAdmin();
  const sessionId = admin ? await admin.latestLiveSessionId() : null;
  const progress = sessionId ? await getProgressReader().getSessionProgress(sessionId) : null;
  return Response.json({ progress }, { headers: { "Cache-Control": "no-store" } });
}
