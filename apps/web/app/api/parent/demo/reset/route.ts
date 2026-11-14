import { hasParentAccess } from "../../../../../lib/parent/access";
import { demoToolsEnabled } from "../../../../../lib/parent/demo";
import { getDemoAdmin, getPipelineStore } from "../../../../../server/storage";
import { resetDemo } from "../../../../../server/storage/sample";

export const dynamic = "force-dynamic";

// Clears every non-sample session and restores the sample. Requires DEMO_TOOLS=true.
export async function POST() {
  if (!demoToolsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  if (!(await hasParentAccess())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = getDemoAdmin();
  if (!admin) return Response.json({ error: "no_database" }, { status: 503 });
  const { removed } = await resetDemo(getPipelineStore(), admin);
  return Response.json({ removed });
}
