import Link from "next/link";
import { childName } from "../../../lib/parent/child";
import { TOPICS, TOPICS_PERIOD, topicTotals } from "../../../lib/parent/topics-data";
import { getPlayStore } from "../../../server/storage";
import { showFor } from "../../../lib/parent/shows";
import { clock } from "../../../lib/play/view";
import { Chip } from "../_components/chip";
import { LevelSteps, SampleBanner, shortDate, StatPills, VideoTag } from "./parts";

// Topic overview (sample data): basic stats, questions missed, getting better / needs practice,
// topic progress cards and the learning plan. Each topic opens its own page.
export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const name = childName();
  const store = getPlayStore();
  const [real, recent] = await Promise.all([store.topics(), store.list(50)]);
  const showName = (id: string) => `${showFor(id).show} · ${showFor(id).episode}`;
  const realMissed = recent
    .flatMap((r) => r.turns.filter((t) => t.outcome === "gave").map((t) => ({ ...t, episodeId: r.session.episodeId })))
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 8);
  const totals = topicTotals();
  const missed = TOPICS.flatMap((t) => t.missed.map((m) => ({ ...m, topic: t })))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {real.length > 0 && (
        <section className="space-y-3 rounded-[24px] bg-[#f9f9fb] p-5" aria-labelledby="real-topics">
          <h2 id="real-topics" className="text-[19px] tracking-tight">
            From {name}&apos;s real play
          </h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {real.map((t) => (
              <li key={t.topic} className="grid gap-1 rounded-xl border border-line bg-white p-3">
                <b className="font-semibold">{t.topic}</b>
                <span className="text-sm text-foreground/70">
                  {t.questions} question{t.questions === 1 ? "" : "s"}: {t.firstTry} before help, {t.afterHelp} after help
                  {t.gave ? `, ${t.gave} shown by Dora` : ""}
                </span>
                <span className="text-xs text-foreground/50">Last seen {shortDate(new Date(t.lastSeen).toISOString())}</span>
              </li>
            ))}
          </ul>
          {realMissed.length > 0 && (
            <>
              <h3 className="pt-2 text-sm font-semibold text-foreground/70">Questions missed</h3>
              <ul className="grid gap-2">
                {realMissed.map((t) => (
                  <li key={t.turnId} className="grid gap-0.5 rounded-xl border border-line bg-white p-3 text-sm">
                    <span>{t.question}</span>
                    <span className="text-foreground/70">
                      {name} said {t.transcript ? `“${t.transcript}”` : "nothing"}
                      {t.expectedAnswer ? ` · expected “${t.expectedAnswer}”` : ""}
                    </span>
                    <span className="text-xs text-foreground/50">
                      {t.topic} · {showName(t.episodeId)}
                      {t.momentSeconds != null ? ` at ${clock(t.momentSeconds)}` : ""} · {shortDate(new Date(t.endedAt).toISOString())}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <SampleBanner>
        How topics could look after a few weeks. These topics, questions and videos are made up for the demo.
      </SampleBanner>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/60">Parent view · topics</p>
          <h1 className="text-2xl font-bold tracking-tight">{name}&apos;s topics</h1>
          <p className="text-sm text-foreground/60">{TOPICS_PERIOD}</p>
        </div>
        <Link className="text-sm underline" href="/parent">
          ← Back to sessions
        </Link>
      </header>

      <StatPills
        items={[
          ["questions asked", totals.asked],
          ["on the first try", totals.firstTry],
          ["after help", totals.afterHelp],
          ["missed", totals.missed],
          ["missed, then got it", totals.missedThenGotIt],
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Topic progress">
        {TOPICS.map((t) => (
          <Link
            key={t.id}
            href={`/parent/topics/${t.id}`}
            className="grid gap-2 rounded-2xl border border-t-[6px] border-line bg-card p-4 hover:bg-foreground/[0.02]"
            style={{ borderTopColor: t.color }}
          >
            <span className="text-lg font-bold" style={{ color: t.color }}>
              {t.name}
            </span>
            <LevelSteps level={t.level} color={t.color} />
            <span className="text-sm text-foreground/70">{t.summary}</span>
            <span className="text-xs text-foreground/60">
              {t.firstTry} of {t.questionsAsked} on the first try · Open topic →
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <ListCard
          title="Getting better at"
          tone="good"
          rows={TOPICS.flatMap((t) => t.gettingBetterAt.map((s) => ({ text: s, topic: t.name, color: t.color })))}
        />
        <ListCard
          title="Needs more practice"
          tone="warn"
          rows={TOPICS.flatMap((t) => t.needsPractice.map((s) => ({ text: s, topic: t.name, color: t.color })))}
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Questions missed</h2>
        <ul className="divide-y divide-line">
          {missed.map((m) => (
            <li key={m.date} className="grid gap-0.5 py-2.5 text-sm">
              <span>
                <span className="mr-2 font-semibold" style={{ color: m.topic.color }}>
                  {m.topic.name}
                </span>
                {m.question}
              </span>
              <span className="text-foreground/70">
                Said “{m.answered}” · answer: {m.expected}
                {m.gotItAfterHelp ? <Chip tone="good">got it after help</Chip> : <Chip tone="warn">try again</Chip>}
              </span>
              <span className="text-xs text-foreground/60">
                {shortDate(m.date)} · <VideoTag video={m.video} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Learning plan</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {TOPICS.map((t) => (
            <li key={t.id} className="space-y-1 text-sm">
              <p className="font-semibold" style={{ color: t.color }}>
                {t.name}
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground/80">
                {t.plan.outcomes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <Link className="text-xs underline" href={`/parent/topics/${t.id}#plan`}>
                See the plan
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ListCard({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "good" | "warn";
  rows: { text: string; topic: string; color: string }[];
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
      <h2 className={`font-semibold ${tone === "good" ? "text-good" : "text-warn"}`}>{title}</h2>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.text}>
            <span className="mr-2 text-xs font-semibold" style={{ color: r.color }}>
              {r.topic}
            </span>
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
