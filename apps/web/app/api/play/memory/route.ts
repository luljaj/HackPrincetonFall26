import { childName } from "../../../../lib/parent/child";
import { getPlayStore } from "../../../../server/storage";

export const dynamic = "force-dynamic";

// What Dora remembers about the child, for the kid view: their name and every word they've practised, with how
// far they got (heard / said / remembered). Read from the same saved progress as the parent view's Mastery.
export async function GET() {
  const mastery = await getPlayStore().mastery().catch(() => null);
  const words: Record<string, string> = {};
  for (const l of mastery?.languages ?? []) for (const w of l.words) words[`${l.language}|${w.word}`] = w.level;
  return Response.json({ name: await childName(), words }, { headers: { "Cache-Control": "no-store" } });
}
