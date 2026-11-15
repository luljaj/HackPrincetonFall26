import { getPlan } from "../../../lib/live/plan";
import { childName } from "../../../lib/parent/child";
import { getPlayStore } from "../../../server/storage";
import { showFor } from "../../../lib/parent/shows";
import { skillOf } from "../../../lib/play/mastery";
import { AutoRefresh } from "../_components/auto-refresh";
import { MasterySection } from "./mastery";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const store = getPlayStore();
  const [mastery, recent, plan, legacy] = await Promise.all([store.mastery(), store.list(50), getPlan(), store.legacyEvidence()]);
  const currentEvidence = recent.flatMap(r => r.turns.map(t => ({
    ...t,
    skillId: skillOf(t.spotId),
    episode: `${showFor(r.session.episodeId).show} · ${showFor(r.session.episodeId).episode}`,
  }))).sort((a, b) => b.endedAt - a.endedAt);
  const evidence = [...currentEvidence, ...legacy.map(t => ({ ...t, skillId: skillOf(t.spotId), episode: `${showFor(t.episodeId).show} · earlier TV session` }))].sort((a,b) => b.endedAt - a.endedAt);
  return <><AutoRefresh seconds={5} /><MasterySection mastery={mastery} name={await childName()} evidence={evidence} initialLanguage={plan.language} /></>;
}
