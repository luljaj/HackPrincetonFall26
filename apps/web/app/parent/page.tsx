import Link from "next/link";
import { childName } from "../../lib/parent/child";
import { demoToolsEnabled } from "../../lib/parent/demo";
import { getParentViewReader } from "../../lib/parent/reader";
import { showFor } from "../../lib/parent/shows";
import { parentStats } from "../../lib/parent/stats";
import { AFTER_HELP_CHIP, SNAPSHOT_NOTE, statsLabels, statusChip } from "../../lib/parent/wording";
import { AutoRefresh } from "./_components/auto-refresh";
import { Chip } from "./_components/chip";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

// Parent home, folded in from the apps/parent mock: the same layout, backed by real sessions.
export default async function ParentHome() {
  const name = childName();
  const views = await getParentViewReader().listParentViews(20);
  const stats = parentStats(views);
  const labels = statsLabels();

  return (
    <>
      <AutoRefresh seconds={5} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
            Parent view
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">{name}&apos;s learning moments</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link className="underline" href="/parent/live">
            Live now
          </Link>
          {demoToolsEnabled() && (
            <Link className="underline" href="/parent/insights">
              Insights
            </Link>
          )}
          <Link className="rounded-full bg-foreground px-[18px] py-2.5 font-semibold text-background" href="/">
            Open Play mode ↗
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <div key={k} className="grid rounded-2xl border border-line bg-card p-[18px]">
            <b className="text-[34px] tabular-nums">{stats[k]}</b>
            <span className="text-sm text-foreground/60">{labels[k]}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-3.5">
        {views.map((v, idx) => {
          const show = showFor(v.sceneId);
          return (
            <details
              key={v.progress.sessionId}
              open={idx === 0}
              className="rounded-2xl border border-l-[6px] border-line bg-card px-5 py-[18px]"
              style={{ borderLeftColor: show.color }}
            >
              <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
                <span className="font-bold" style={{ color: show.color }}>
                  {show.show}
                </span>
                <span className="text-sm text-foreground/60">
                  {[show.episode, when(v.startedAt)].filter(Boolean).join(" · ")}
                  {v.isSample && (
                    <span className="ml-2 rounded border border-foreground/30 px-1.5 text-xs uppercase">
                      Sample data
                    </span>
                  )}
                </span>
                <p className="col-span-2 text-[17px]">
                  {v.progress.episode.parentSummary ?? "No answer was heard in this session yet."}
                </p>
              </summary>
              <ol className="mt-4 grid gap-3.5">
                {v.progress.interactions.map((i) => {
                  const chip = statusChip(i.assessment.answerStatus);
                  return (
                    <li key={i.interactionId} className="grid gap-1.5 border-t border-line pt-3.5">
                      <p className="grid grid-cols-[100px_1fr]">
                        <span className="text-[13px] text-foreground/60">Dora asked</span>
                        {i.questionText}
                      </p>
                      <p className="grid grid-cols-[100px_1fr]">
                        <span className="text-[13px] text-foreground/60">{name} said</span>
                        <span>
                          {i.transcript ? `“${i.transcript}”` : <em className="text-foreground/60">nothing heard</em>}
                          <Chip tone={chip.tone}>{chip.label}</Chip>
                          {i.assessment.assistanceBeforeAnswer && <Chip tone="muted">{AFTER_HELP_CHIP}</Chip>}
                        </span>
                      </p>
                      <p className="grid grid-cols-[100px_1fr]">
                        <span className="text-[13px] text-foreground/60">Dora replied</span>
                        {i.responseText}
                      </p>
                    </li>
                  );
                })}
                {v.progress.activeQuestion && (
                  <li className="border-t border-line pt-3.5 text-sm text-foreground/70">
                    Dora is asking: “{v.progress.activeQuestion.text}” · waiting for the answer
                  </li>
                )}
              </ol>
              <Link
                className="mt-3 inline-block text-sm underline"
                href={`/parent/${v.progress.sessionId}`}
              >
                Open this session
              </Link>
            </details>
          );
        })}
      </section>

      <p className="text-sm text-foreground/60">{SNAPSHOT_NOTE}</p>
    </>
  );
}
