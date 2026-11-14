import { notFound } from "next/navigation";
import { childName } from "../../../lib/parent/child";
import { getParentViewReader } from "../../../lib/parent/reader";
import { SAMPLE_SESSION_ID } from "../../../lib/parent/sample-id";
import { DeleteSessionButton } from "../_components/delete-session-button";
import { LiveProgress } from "./live-progress";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const initial = await getParentViewReader().getParentView(sessionId);
  if (!initial) notFound();
  return (
    <div className="space-y-8">
      <LiveProgress initial={initial} childName={childName()} />
      {sessionId !== SAMPLE_SESSION_ID && <DeleteSessionButton sessionId={sessionId} />}
    </div>
  );
}
