import { getPlayStore } from "../../../server/storage";
import { subjectRoadmaps } from "../../../lib/parent/curriculum";
import { AutoRefresh } from "../_components/auto-refresh";
import { RoadmapCards } from "./roadmap-cards";
export const dynamic = "force-dynamic";
export default async function RoadmapPage() {
  const mastery = await getPlayStore().mastery();
  const subjects = subjectRoadmaps(mastery);
  return (
    <div className="roadmap-page">
      <AutoRefresh seconds={5} />
      <h2 className="parent-heading">Roadmap</h2>
      <RoadmapCards subjects={subjects} />
    </div>
  );
}
