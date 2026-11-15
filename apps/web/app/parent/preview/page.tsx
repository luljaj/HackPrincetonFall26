import { getPlayStore } from "../../../server/storage";
import { subjectRoadmaps } from "../../../lib/parent/curriculum";
import { AutoRefresh } from "../_components/auto-refresh";
import { childName } from "../../../lib/parent/child";
export const dynamic = "force-dynamic";
const ICON: Record<string,string> = { numbers: "home-imgImage18Vectorized", shapes: "home-imgMastery1", remembering: "home-imgInsights1", choosing: "home-imgRoadmap1", words: "home-imgImage19Vectorized", stories: "home-imgPuzzledSmileyStreamlineFlex1Vectorized", "joining-in": "home-imgTv1", "show-spanish": "home-imgMastery1" };
/* eslint-disable @next/next/no-img-element -- Exact local Figma artwork. */
export default async function RoadmapPage() {
  const mastery = await getPlayStore().mastery();
  const subjects = subjectRoadmaps(mastery);
  return <div className="roadmap-page"><AutoRefresh seconds={5} />
    <h2 className="parent-heading">Roadmap</h2>
    <p className="roadmap-intro">{childName()}&apos;s Dora curriculum, one subject at a time. Scroll down each track to see what comes next.</p>
    <p className="roadmap-note">Grade bands describe this draft curriculum, not a grade placement. Grey checkpoints unlock as earlier skills reach mastery; planned topics need a new episode lesson.</p>
    {subjects.map(subject => <section className="roadmap-subject" key={subject.id} aria-label={`${subject.name} roadmap`}>
      <header><h3>{subject.name}</h3><span>{subject.nodes.filter(n => n.state === "complete").length}/{subject.nodes.length} checkpoints at mastery</span></header>
      <div className="roadmap-scroll" tabIndex={0} role="region" aria-label={`Scroll ${subject.name} checkpoints vertically`}>
        <div className="roadmap-course" style={{ height: subject.nodes.length * 240 + 90 }}>
          <svg className="roadmap-path" aria-hidden="true">{subject.nodes.slice(0,-1).map((node,n) => <line key={node.id} x1={n%2 ? "72%" : "28%"} y1={n*240+183} x2={n%2 ? "28%" : "72%"} y2={(n+1)*240+183} stroke={node.state === "complete" ? "#ffe436" : "#b7bec850"} strokeWidth="35" />)}</svg>
          <div className="roadmap-ruler" aria-hidden="true">{subject.nodes.map(node => <span key={node.id} style={{ top: node.checkpoint / 10 * 240 + 130 }}>{node.checkpoint}<i /></span>)}</div>
          {subject.nodes.map((node,n) => (n === 0 || node.band !== subject.nodes[n-1]?.band) && <div key={node.id} className="roadmap-grade-divider" style={{ top: n * 240 + 15 }}><span>{node.band}</span></div>)}
          {subject.nodes.map((node, n) => <div className="roadmap-checkpoint" data-state={node.state} key={node.id} style={{ left: n % 2 ? "72%" : "28%", top: n * 240 + 58 }}>
            <p className="roadmap-grade">{node.band}</p>
            <div className="roadmap-token">
              {subject.id === "numbers" ? <img className="roadmap-math" src={`/figma/roadmap-imgFrame${node.state === "locked" || node.state === "planned" ? "86" : "84"}.svg`} alt="" />
                : <><img className="roadmap-hex" src="/figma/roadmap-imgPolygon2.svg" alt="" /><span className="roadmap-topic-icon"><img src={`/figma/${ICON[subject.id]}.svg`} alt="" /></span></>}
              {(node.state === "locked" || node.state === "planned") && subject.id !== "numbers" && <img className="roadmap-lock" src="/figma/roadmap-lock.svg" alt="" />}
              {node.state === "complete" && <span className="roadmap-complete" aria-label="Mastery">✓</span>}
            </div>
            <h4>{node.name}</h4><p className="roadmap-status">{node.state === "complete" ? "Mastery" : node.state === "planned" ? "Planned lesson" : node.state === "locked" ? "Locked · earlier checkpoint first" : node.asked ? `${node.asked} saved attempts · practising` : "Start here"}</p>
            <small>{node.lessonIds.length ? `${node.lessonIds.length} prepared Dora moments` : "New teaching moment needed"}</small>
          </div>)}
        </div>
      </div>
    </section>)}
  </div>;
}
