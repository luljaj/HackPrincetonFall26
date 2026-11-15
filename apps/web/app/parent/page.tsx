import Link from "next/link";
import { childName } from "../../lib/parent/child";
import { groupByShow } from "../../lib/parent/group";
import { getParentViewReader } from "../../lib/parent/reader";
import { parentStats } from "../../lib/parent/stats";
import { SNAPSHOT_NOTE, statsLabels, statusChip } from "../../lib/parent/wording";
import { showFor } from "../../lib/parent/shows";
import { getPlayStore, getPreferencesStore } from "../../server/storage";
import { topicRows } from "../../server/storage/play";
import { AutoRefresh } from "./_components/auto-refresh";
import { Chip } from "./_components/chip";
import { FocusControls } from "./_components/focus-controls";

import { TurnRows } from "./_components/turn-rows";
import { WeekGauge } from "./_components/week-gauge";
import { demoToolsEnabled } from "../../lib/parent/demo";
import InsightsPage from "./insights/page";
import TopicsPage from "./topics/page";
import PreviewPage from "./preview/page";
import SettingsPage from "./settings/page";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

// Compact parent home: counts, learning focus, then one collapsed row per show. Click a show to
// see its sessions; click a session to see what was asked and answered.
export default async function ParentHome() {
  const name = await childName();
  const [views, prefs] = await Promise.all([
    getParentViewReader().listParentViews(50),
    getPreferencesStore().get(),
  ]);
  // Same rule as the counts: once real sessions exist, the seeded sample stays out of the list.
  const real = views.filter((v) => !v.isSample);
  const listed = real.length > 0 ? real : views;
  const stats = parentStats(views);
  const labels = statsLabels(stats);
  const shows = groupByShow(listed);

  // This week, across the same sessions as the tiles (real ones once any exist).
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekTurns = listed.filter((v) => Date.parse(v.startedAt) >= weekAgo).flatMap((v) => v.progress.interactions);
  const week = {
    firstTry: weekTurns.filter((t) => t.assessment.answerStatus === "correct" && !t.assessment.assistanceBeforeAnswer).length,
    afterHelp: weekTurns.filter((t) => t.assessment.answerStatus === "correct" && t.assessment.assistanceBeforeAnswer).length,
    missed: weekTurns.filter((t) => t.assessment.answerStatus === "incorrect").length,
    unclear: weekTurns.filter((t) => t.assessment.answerStatus !== "correct" && t.assessment.answerStatus !== "incorrect").length,
  };
  // Headline: the topic answered first-try most this week (play trace), else the latest summary.
  const top = topicRows(
    (await getPlayStore().list(100)).flatMap((r) => r.turns).filter((t) => t.endedAt >= weekAgo),
  ).sort((x, y) => y.firstTry - x.firstTry)[0];
  const headline =
    top && top.firstTry > 0
      ? `${name} answered ${top.firstTry} of ${top.questions} ${top.topic.toLowerCase()} question${top.questions === 1 ? "" : "s"} on the first try this week.`
      : (listed.find((v) => v.progress.episode.parentSummary)?.progress.episode.parentSummary ??
        `${name} hasn't answered a question yet. Open Play mode to start.`);

  return (
    <>
      <AutoRefresh seconds={5} />
      <section id="home" aria-label="Home" className="scroll-mt-10">
      <h1 className="parent-heading">{name}&apos;s Learning Moments</h1>
      <div className="learning-overview">
        <div className="learning-summary">
          <p className="learning-headline">{headline}</p>
          <div className="learning-stats">
            {[
              { key: "watched", icon: "Image18Vectorized", value: stats.sessions, label: labels.sessions },
              { key: "answered", icon: "Image19Vectorized", value: stats.answered, label: labels.answered },
              { key: "afterHelp", icon: "PuzzledSmileyStreamlineFlex1Vectorized", value: stats.correctAfterHelp, label: labels.correctAfterHelp },
            ].map(({ key, icon, value, label }) => (
              <div key={key} className="learning-stat" data-stat={key}>
                <span className="stat-icon" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="stat-glow" src={`/figma/home-img${icon}.svg`} alt="" width={36} height={36} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/figma/home-img${icon}.svg`} alt="" width={36} height={36} />
                </span>
                <div><b>{value}</b><small>{label}</small></div>
              </div>
            ))}
          </div>
        </div>
        <WeekGauge firstTry={week.firstTry} afterHelp={week.afterHelp} missed={week.missed} unclear={week.unclear} />
      </div>
      <section className="parent-recent" aria-labelledby="recent-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-title">Recently watched</h2>
          <Link className="text-xs text-foreground/60 underline" href="/parent/live">Live now ↗</Link>
        </div>
        {listed.length === 0 && <p className="mt-4 text-sm text-foreground/60">Nothing watched yet.</p>}
        <ul tabIndex={0} aria-label="Recently watched episodes, scroll horizontally">
          {listed.map((v) => {
            const show = showFor(v.sceneId);
            return (
              <li key={v.progress.sessionId}>
                <Link href={`/parent/${v.progress.sessionId}`} className="episode-card">
                  <div className="episode-cover">
                    {show.show === "Dora" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src="/figma/home-imgImage21.png" alt="Dora and Boots" />
                    ) : <div className="h-full" style={{ background: show.color }} />}
                  </div>
                  <div><h3>{show.show}</h3><p>{show.episode.trim() ? <>&lsquo;{show.episode}&rsquo;</> : "Untitled episode"}{v.isSample ? " · Sample data" : ""}</p></div>
                  <footer>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/figma/home-imgAkarIconsHistory.svg" alt="" width={15} height={15} />
                    <time dateTime={v.startedAt}>{when(v.startedAt)}</time>
                    <span className="episode-view">View</span>
                  </footer>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <details className="parent-extras">
        <summary>Learning plan &amp; session history</summary>
      <FocusControls initial={prefs} />

      <section className="space-y-2" aria-labelledby="shows-title">
        <h2 id="shows-title" className="text-sm font-semibold text-foreground/60">
          Shows
        </h2>
        {shows.length === 0 && <p className="text-sm text-foreground/60">No sessions yet.</p>}
        {shows.map((g) => (
          <details
            key={g.show}
            className="group rounded-2xl border border-l-[6px] border-line bg-card"
            style={{ borderLeftColor: g.color }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="font-bold" style={{ color: g.color }}>
                {g.show}
              </span>
              <span className="text-sm text-foreground/60">
                {g.sessions.length} session{g.sessions.length === 1 ? "" : "s"} · {g.answered} answered · last{" "}
                {when(g.sessions[0]!.startedAt)}
              </span>
              <span aria-hidden className="ml-auto text-foreground/40 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <ul className="space-y-2 px-4 pb-4">
              {g.sessions.map((v) => {
                const last = v.progress.interactions.at(-1);
                const chip = last ? statusChip(last.assessment.answerStatus) : null;
                return (
                  <li key={v.progress.sessionId}>
                    <details className="group/s rounded-xl border border-line">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                        <span className="text-foreground/60">{when(v.startedAt)}</span>
                        {v.isSample && (
                          <span className="rounded border border-foreground/30 px-1 text-[10px] uppercase">Sample</span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {v.progress.episode.parentSummary ?? "No answer heard yet."}
                        </span>
                        {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
                        <span aria-hidden className="text-foreground/40 transition-transform group-open/s:rotate-90">
                          ›
                        </span>
                      </summary>
                      <div className="space-y-2 px-3 pb-3">
                        <TurnRows view={v} childName={name} />
                        <Link className="inline-block text-sm underline" href={`/parent/${v.progress.sessionId}`}>
                          Open this session
                        </Link>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </section>

      <p className="mt-5 text-xs text-foreground/60">{SNAPSHOT_NOTE}</p>
      </details>
      </section>

      {/* One scrolling page: every tab is a section, and the side nav scrolls between them. */}
      {demoToolsEnabled() && (
        <Section id="insights" label="Insights">
          <InsightsPage searchParams={Promise.resolve({})} />
        </Section>
      )}
      <Section id="mastery" label="Mastery">
        <TopicsPage />
      </Section>
      <Section id="roadmap" label="Roadmap">
        <PreviewPage />
      </Section>
      <Section id="settings" label="Settings">
        <SettingsPage />
      </Section>
    </>
  );
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="parent-section space-y-8">
      {children}
    </section>
  );
}
