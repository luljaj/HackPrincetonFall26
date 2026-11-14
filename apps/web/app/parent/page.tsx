import Link from "next/link";
import { childName } from "../../lib/parent/child";
import { demoToolsEnabled } from "../../lib/parent/demo";
import { groupByShow } from "../../lib/parent/group";
import { getParentViewReader } from "../../lib/parent/reader";
import { parentStats } from "../../lib/parent/stats";
import { SNAPSHOT_NOTE, statsLabels, statusChip } from "../../lib/parent/wording";
import { getPreferencesStore } from "../../server/storage";
import { AutoRefresh } from "./_components/auto-refresh";
import { Chip } from "./_components/chip";
import { FocusControls } from "./_components/focus-controls";
import { TurnRows } from "./_components/turn-rows";

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

  return (
    <>
      <AutoRefresh seconds={5} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/60">Parent view</p>
          <h1 className="text-2xl font-bold tracking-tight">{name}&apos;s learning moments</h1>
        </div>
        <Link className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background" href="/">
          Open Play mode ↗
        </Link>
      </header>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Parent pages">
        <Link className="underline" href="/parent/live">
          Live now
        </Link>
        <Link className="underline" href="/parent/preview">
          Preview by subject (sample)
        </Link>
        {demoToolsEnabled() && (
          <Link className="underline" href="/parent/insights">
            Insights
          </Link>
        )}
      </nav>

      <p className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <span key={k} className="rounded-full border border-line bg-card px-3 py-1">
            <b className="tabular-nums">{stats[k]}</b> <span className="text-foreground/60">{labels[k]}</span>
          </span>
        ))}
      </p>

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
    </>
  );
}
