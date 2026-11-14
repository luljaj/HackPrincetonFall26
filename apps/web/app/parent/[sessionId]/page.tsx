import { notFound } from "next/navigation";
import { getProgressReader } from "../../../lib/parent/reader";
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
  return <LiveProgress initial={initial} />;
}
