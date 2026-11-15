import Link from "next/link";
import { notFound } from "next/navigation";
import { childName } from "../../../../lib/parent/child";
import { TOPIC_LEVEL, TOPICS, topicById } from "../../../../lib/parent/topics-data";
import { Chip } from "../../_components/chip";
import { LevelSteps, SampleBanner, shortDate, StatPills, VideoTag } from "../parts";

export function generateStaticParams() {
  return TOPICS.map((t) => ({ topic: t.id }));
}

// One topic (sample data): what was learned and from which video, questions missed,
// getting better / needs practice, and the learning plan (outcomes + what to watch next).
export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: id } = await params;
  const t = topicById(id);
  if (!t) notFound();
  const name = await childName();

  return (
    <>
      <SampleBanner>This topic page uses made-up sessions and videos for the demo.</SampleBanner>

      <header className="space-y-3">
        <Link className="text-sm text-foreground/60 underline" href="/parent/topics">
          ← All topics
        </Link>
        <div
          className="space-y-2 rounded-2xl border border-l-[6px] border-line bg-card px-5 py-4"
          style={{ borderLeftColor: t.color }}
        >
          <h1 className="text-2xl font-bold" style={{ color: t.color }}>
            {t.name}
          </h1>
          <LevelSteps level={t.level} color={t.color} />
          <p className="text-sm text-foreground/60">{TOPIC_LEVEL[t.level].note}</p>
          <p className="text-[15px]">{t.summary}</p>
        </div>
      </header>

      <StatPills
        items={[
          ["questions asked", t.questionsAsked],
          ["on the first try", t.firstTry],
          ["after help", t.afterHelp],
          ["missed", t.missed.length],
        ]}
      />

      <section className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">What {name} learned</h2>
        <ul className="divide-y divide-line">
          {t.learned.map((l) => (
            <li key={l.date} className="grid gap-0.5 py-2.5 text-sm">
              <span>
                {l.skill}
                {l.howAnswered === "first_try" ? (
                  <Chip tone="good">first try</Chip>
                ) : (
                  <Chip tone="muted">after help</Chip>
                )}
              </span>
              <span className="text-xs text-foreground/60">
                Learned from <VideoTag video={l.video} /> · {shortDate(l.date)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Questions missed</h2>
        <ul className="divide-y divide-line">
          {t.missed.map((m) => (
            <li key={m.date} className="grid gap-0.5 py-2.5 text-sm">
              <span>{m.question}</span>
              <span className="text-foreground/70">
                {name} said “{m.answered}” · answer: {m.expected}
                {m.gotItAfterHelp ? <Chip tone="good">got it after help</Chip> : <Chip tone="warn">try again</Chip>}
              </span>
              <span className="text-xs text-foreground/60">
                <VideoTag video={m.video} /> · {shortDate(m.date)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold text-good">Getting better at</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {t.gettingBetterAt.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold text-warn">Needs more practice</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {t.needsPractice.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="plan" className="scroll-mt-6 space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Learning plan</h2>
        <div>
          <h3 className="text-sm text-foreground/60">Outcomes to aim for</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {t.plan.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm text-foreground/60">Up next to watch</h3>
          <ul className="mt-1 divide-y divide-line">
            {t.plan.nextUp.map((n) => (
              <li key={n.activity} className="grid gap-0.5 py-2 text-sm">
                <span>{n.activity}</span>
                <VideoTag video={n.video} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
