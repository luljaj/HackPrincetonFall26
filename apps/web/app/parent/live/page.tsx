import { childName } from "../../../lib/parent/child";
import { demoToolsEnabled } from "../../../lib/parent/demo";
import { LiveSession } from "./live-session";

export const dynamic = "force-dynamic";

// The page to keep open beside the cartoon during the demo: always shows the newest live session.
export default async function LivePage() {
  return <LiveSession demoTools={demoToolsEnabled()} childName={await childName()} />;
}
