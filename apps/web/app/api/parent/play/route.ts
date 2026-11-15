import { hasParentAccess } from "../../../../lib/parent/access";
import { getPlayStore } from "../../../../server/storage";

export const dynamic = "force-dynamic";

// Parent deletes every Play-mode trace (Settings → Delete all). One trace: DELETE /api/parent/sessions/[id].
export async function DELETE() {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deleted = await getPlayStore().deleteAll();
  return Response.json({ deleted });
}
