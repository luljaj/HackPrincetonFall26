import { childName } from "../../../lib/parent/child";
import { getPlayStore } from "../../../server/storage";
import { showFor } from "../../../lib/parent/shows";
import { skillOf } from "../../../lib/play/mastery";
import { MasterySection } from "./mastery";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const store = getPlayStore();
  const [mastery, recent] = await Promise.all([store.mastery(), store.list(50)]);
  const evidence = recent.flatMap(r => r.turns.map(t => ({
    ...t,
    skillId: skillOf(t.spotId),
    episode: `${showFor(r.session.episodeId).show} · ${showFor(r.session.episodeId).episode}`,
  }))).sort((a, b) => b.endedAt - a.endedAt);
  return <MasterySection mastery={mastery} name={childName()} evidence={evidence} />;
}
