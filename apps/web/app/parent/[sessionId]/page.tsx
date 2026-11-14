import { notFound } from "next/navigation";
import { getProgressReader } from "../../../lib/parent/reader";
import { SAMPLE_SESSION_ID } from "../../../server/storage/sample-data";
import { DeleteSessionButton } from "../_components/delete-session-button";
import { LiveProgress } from "./live-progress";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const initial = await getProgressReader().getSessionProgress(sessionId);
  if (!initial) notFound();
  return (
    <div className="space-y-8">
      <LiveProgress initial={initial} />
      {sessionId !== SAMPLE_SESSION_ID && <DeleteSessionButton sessionId={sessionId} />}
    </div>
  );
}
