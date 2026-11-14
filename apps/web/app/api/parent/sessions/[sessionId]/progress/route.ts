import { hasParentAccess } from "../../../../../../lib/parent/access";
import { getProgressReader } from "../../../../../../lib/parent/reader";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { sessionId } = await params;
  const progress = await getProgressReader().getSessionProgress(sessionId);
  if (!progress) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // SessionProgress is already the parent-safe shape; never spread raw records into it.
  return Response.json(progress, { headers: { "Cache-Control": "no-store" } });
}
