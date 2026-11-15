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
import { ChatPanel } from "./_components/chat-panel";
import { Chip } from "./_components/chip";
import { FocusControls } from "./_components/focus-controls";
import { STAT_TILES } from "./_components/stat-icons";
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
  const name = childName();
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
    missed: weekTurns.filter((t) => t.assessment.answerStatus !== "correct").length,
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
      <section id="home" aria-label="Home" className="scroll-mt-10 space-y-8">
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_400px]">
        <header className="space-y-6">
          <h1 className="text-[44px] leading-tight tracking-tight">{name}&apos;s Learning Moments</h1>
          <p className="max-w-[600px] text-[24px] leading-snug text-foreground/60">{headline}</p>
          <div className="flex flex-wrap gap-3">
            {STAT_TILES.map(({ key, icon }, i) => (
              <div
                key={key}
                className={`flex w-[200px] items-center gap-3 rounded-2xl border p-4 ${
                  i === 0
                    ? "border-[#f3e9b0] bg-gradient-to-br from-[#fdf3b8] via-[#fbf8e6] to-[#eef1ff] shadow-[0_2px_10px_rgba(253,230,120,0.35)]"
                    : "border-[#f1ecd0] bg-gradient-to-br from-[#f4f6ff] to-[#fbf9ea]"
                }`}
              >
                <span className="shrink-0 scale-125">{icon}</span>
                <div className="grid">
                  <b className="text-[28px] font-bold leading-none tabular-nums">{stats[key]}</b>
                  <span className="mt-1 text-[13px] leading-tight text-foreground/55 first-letter:uppercase">{labels[key]}</span>
                </div>
              </div>
            ))}
          </div>
        </header>
        <WeekGauge firstTry={week.firstTry} afterHelp={week.afterHelp} missed={week.missed} />
      </div>

      <section className="space-y-5 rounded-[40px] bg-[#f9f9fb] p-8 md:mt-16" aria-labelledby="recent-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-title" className="text-[28px] tracking-tight">
            Recently watched
          </h2>
          <span className="flex gap-4 text-sm">
            <Link className="underline" href="/parent/live">
              Live now
            </Link>
            <Link className="underline" href="/">
              Open Play mode ↗
            </Link>
          </span>
        </div>
        {listed.length === 0 && <p className="text-sm text-foreground/60">Nothing watched yet.</p>}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listed.slice(0, 6).map((v) => {
            const show = showFor(v.sceneId);
            return (
              <li key={v.progress.sessionId}>
                <Link href={`/parent/${v.progress.sessionId}`} className="group block space-y-2">
                  <div
                    className="flex h-[170px] flex-col justify-between rounded-2xl p-4 text-white transition-transform group-hover:-translate-y-0.5"
                    style={{ background: `linear-gradient(135deg, ${show.color}, ${show.color}99 60%, #d9d9d9)` }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-90">
                      {when(v.startedAt)}
                      {v.isSample ? " · sample" : ""}
                    </span>
                    <span>
                      <b className="block text-[22px] font-semibold leading-tight">{show.show}</b>
                      <span className="text-sm opacity-90">{show.episode}</span>
                    </span>
                  </div>
                  <p className="line-clamp-2 px-1 text-sm text-foreground/70">
                    {v.progress.episode.parentSummary ?? "No answer heard yet."}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mx-auto w-full max-w-[780px]">
        <ChatPanel child={name} />
      </div>

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

      <p className="text-xs text-foreground/60">{SNAPSHOT_NOTE}</p>
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
    <section id={id} aria-label={label} className="scroll-mt-10 space-y-8 border-t border-foreground/10 pt-14">
      {children}
    </section>
  );
}
