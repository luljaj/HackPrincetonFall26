import Link from "next/link";
import {
  gradeProgress,
  PREVIEW_CHILD,
  PREVIEW_PERIOD,
  PREVIEW_SUBJECTS,
  SKILL_STATUS_LABEL,
  type PreviewSubject,
  type SkillStatus,
} from "../../../lib/parent/preview-data";
import { FOCUS_LABEL, type Focus } from "../../../lib/parent/preferences";
import { getParentViewReader } from "../../../lib/parent/reader";
import { getPreferencesStore } from "../../../server/storage";
import { AFTER_HELP_CHIP, statusChip, type ChipTone } from "../../../lib/parent/wording";
import { Chip } from "../_components/chip";

export const dynamic = "force-dynamic";

const SKILL_TONE: Record<SkillStatus, ChipTone> = {
  first_try: "good",
  after_help: "muted",
  practicing: "warn",
  up_next: "muted",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Vision preview for the demo: hard-coded sample data (lib/parent/preview-data.ts), labeled as
// such everywhere. Only the "Live today" box under Math reads real sessions.
export default async function PreviewPage() {
  const realMath = (await getParentViewReader().listParentViews(20)).filter((v) => !v.isSample);
  const { focus } = await getPreferencesStore().get();

  return (
    <>
      <div
        role="note"
        className="rounded-2xl border-2 border-dashed border-warn bg-warn/10 px-5 py-4 text-sm"
      >
        <p className="font-semibold">Preview with sample data</p>
        <p className="text-foreground/80">
          How {PREVIEW_CHILD}&apos;s view could look after a few weeks of watching. These subjects,
          skills and sessions are made up for the demo. Only the &ldquo;Live today&rdquo; box under
          Math shows real sessions.
        </p>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
            Parent view · preview
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">
            {PREVIEW_CHILD}&apos;s learning by subject
          </h1>
          <p className="text-sm text-foreground/60">{PREVIEW_PERIOD}</p>
        </div>
        <Link className="text-sm underline" href="/parent">
          ← Back to real sessions
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Subjects">
        {PREVIEW_SUBJECTS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-semibold"
            style={{ color: s.color }}
          >
            {s.name}
          </a>
        ))}
      </nav>

      {PREVIEW_SUBJECTS.map((s) => (
        <SubjectSection key={s.id} subject={s} focus={focus} liveCount={s.id === "math" ? realMath.length : null} />
      ))}

      <p className="text-sm text-foreground/60">
        Sample data for the demo. A real view would only show what was actually heard and saved,
        and a single answer is a snapshot, not a measure of mastery.
      </p>
    </>
  );
}

function SubjectSection({
  subject,
  focus,
  liveCount,
}: {
  subject: PreviewSubject;
  focus: Focus;
  liveCount: number | null;
}) {
  const level = focus[subject.id] ?? "usual"; // sample subjects aren't focus categories
  return (
    <section
      id={subject.id}
      className="scroll-mt-6 space-y-5 rounded-2xl border border-l-[6px] border-line bg-card px-5 py-5"
      style={{ borderLeftColor: subject.color }}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold" style={{ color: subject.color }}>
            {subject.name}
          </h2>
          <span className="rounded border border-foreground/30 px-1.5 text-xs uppercase">Sample</span>
          {level !== "usual" && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: subject.color }}>
              {FOCUS_LABEL[level]} focus (your setting)
            </span>
          )}
        </div>
        <p className="text-[17px]">{subject.headline}</p>
      </div>

      <GradePath subject={subject} />

      {liveCount !== null && (
        <div className="rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm">
          <p className="font-semibold">Live today: real Dora counting sessions</p>
          <p className="text-foreground/80">
            {liveCount === 0
              ? "Today's Dora apple-counting moments will appear here as real Math sessions."
              : `${liveCount} real session${liveCount === 1 ? "" : "s"} from today's demo count toward Math.`}{" "}
            <Link className="underline" href="/parent">
              See them
            </Link>
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground/60">Skills</h3>
        <ul className="divide-y divide-line">
          {subject.skills.map((k) => (
            <li key={k.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="mr-2 rounded bg-foreground/5 px-1.5 py-0.5 text-xs text-foreground/60">
                  Grade {k.grade}
                </span>
                {k.name}
              </span>
              <span className="text-sm text-foreground/60">
                {k.tries > 0 ? `${k.tries} tries` : ""}
                <Chip tone={SKILL_TONE[k.status]}>{SKILL_STATUS_LABEL[k.status]}</Chip>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground/60">Recent moments (sample)</h3>
        <ol className="grid gap-3">
          {subject.sessions.map((m) => {
            const chip = statusChip(m.status);
            return (
              <li key={m.date} className="grid gap-1 border-t border-line pt-3">
                <p className="text-sm text-foreground/60">
                  <span className="font-semibold" style={{ color: m.color }}>
                    {m.show}
                  </span>{" "}
                  · {day(m.date)}
                </p>
                <p>{m.question}</p>
                <p>
                  <span className="text-foreground/60">{PREVIEW_CHILD} said: </span>“{m.answer}”
                  <Chip tone={chip.tone}>{chip.label}</Chip>
                  {m.afterHelp && <Chip tone="muted">{AFTER_HELP_CHIP}</Chip>}
                </p>
                <p className="text-sm text-foreground/70">{m.summary}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function GradePath({ subject }: { subject: PreviewSubject }) {
  const g1 = gradeProgress(subject, 1);
  const g2 = gradeProgress(subject, 2);
  const practicing = subject.skills.filter((k) => k.grade === 2 && k.status === "practicing").length;
  const g2Total = subject.skills.filter((k) => k.grade === 2).length;
  const rows = [
    { label: `Grade ${subject.gradeFrom}`, filled: g1.answered, total: g1.total, note: `${g1.answered} of ${g1.total} skills answered` },
    {
      label: `Grade ${subject.gradeTo}`,
      filled: g2.answered + practicing * 0.5,
      total: g2Total,
      note: `practicing ${practicing} of ${g2Total} skills`,
    },
  ];
  return (
    <div className="space-y-2" aria-label={`${subject.name} grade path`}>
      <h3 className="text-sm font-semibold text-foreground/60">
        Grade path: Grade {subject.gradeFrom} → Grade {subject.gradeTo}
      </h3>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-sm">
          <span className="font-semibold">{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.total ? (r.filled / r.total) * 100 : 0}%`, background: subject.color }}
            />
          </div>
          <span className="text-foreground/60">{r.note}</span>
        </div>
      ))}
    </div>
  );
}
