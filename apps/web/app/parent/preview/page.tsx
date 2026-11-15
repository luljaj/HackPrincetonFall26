import Link from "next/link";
import {
  currentSkill,
  PREVIEW_CHILD,
  PREVIEW_PERIOD,
  PREVIEW_SUBJECTS,
  SKILL_STATUS_LABEL,
  whereNow,
  type PreviewSkill,
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
  const level = focus[subject.id];
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
        <h3 className="mb-1 text-sm font-semibold text-foreground/60">Skills, in plain words</h3>
        <ul className="divide-y divide-line">
          {subject.skills.map((k) => (
            <SkillRow key={k.name} skill={k} color={subject.color} />
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

/** A skill in parent words: what it is, an example from a show, and how it's been going lately. */
function SkillRow({ skill, color }: { skill: PreviewSkill; color: string }) {
  return (
    <li className="grid gap-1 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{skill.name}</span>
        <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs text-foreground/60">Grade {skill.grade}</span>
        <Chip tone={SKILL_TONE[skill.status]}>{SKILL_STATUS_LABEL[skill.status]}</Chip>
      </div>
      <p className="text-foreground/80">{skill.plain}</p>
      <p className="text-foreground/60">
        <span className="font-medium text-foreground/70">Example:</span> {skill.example}
      </p>
      {skill.recent > 0 && (
        <p className="flex items-center gap-2 text-xs text-foreground/60">
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: skill.recent }, (_, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full border"
                style={i < skill.firstTry ? { background: color, borderColor: color } : { borderColor: color }}
              />
            ))}
          </span>
          {skill.firstTry} of the last {skill.recent} tries right on the first try
        </p>
      )}
    </li>
  );
}

const STEP_STYLE: Record<SkillStatus, (color: string) => React.CSSProperties> = {
  first_try: (c) => ({ background: c, borderColor: c, color: "white" }),
  after_help: (c) => ({ background: `color-mix(in srgb, ${c} 55%, white)`, borderColor: c, color: "white" }),
  practicing: (c) => ({ borderColor: c, color: c, borderWidth: 2 }),
  up_next: () => ({ borderStyle: "dashed" }),
};

/**
 * The grade path as steps: every skill from Grade 1 to Grade 2 in order, filled in as it's done,
 * with "Sam is here" on the one being worked on now. Plus the dated milestones that got there.
 */
function GradePath({ subject }: { subject: PreviewSubject }) {
  const here = currentSkill(subject);
  const lanes = [1, 2] as const;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground/60">
          Grade path: Grade {subject.gradeFrom} → Grade {subject.gradeTo}
        </h3>
        <p className="text-[15px] font-medium">{whereNow(subject, PREVIEW_CHILD)}</p>
      </div>

      <ol className="space-y-3">
        {lanes.map((grade) => (
          <li key={grade} className="grid gap-2 sm:grid-cols-[72px_1fr] sm:items-start">
            <span className="pt-1 text-sm font-bold">Grade {grade}</span>
            <ol className="flex flex-wrap items-center gap-1.5">
              {subject.skills
                .filter((k) => k.grade === grade)
                .map((k, i, arr) => (
                  <li key={k.name} className="flex items-center gap-1.5">
                    <span
                      className="rounded-full border border-foreground/25 px-2.5 py-1 text-xs font-semibold text-foreground/60"
                      style={STEP_STYLE[k.status](subject.color)}
                      title={SKILL_STATUS_LABEL[k.status]}
                    >
                      {(k.status === "first_try" || k.status === "after_help") && <span aria-hidden>✓ </span>}
                      {k.name}
                    </span>
                    {k === here && (
                      <span className="whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                        ← {PREVIEW_CHILD} is here
                      </span>
                    )}
                    {i < arr.length - 1 && (
                      <span aria-hidden className="text-foreground/30">
                        →
                      </span>
                    )}
                  </li>
                ))}
            </ol>
          </li>
        ))}
      </ol>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60" aria-label="Legend">
        {(Object.keys(SKILL_STATUS_LABEL) as SkillStatus[]).map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border border-foreground/25"
              style={STEP_STYLE[st](subject.color)}
            />
            {SKILL_STATUS_LABEL[st]}
          </span>
        ))}
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground/60">How {PREVIEW_CHILD} got here</h3>
        <ol className="relative space-y-3 border-l-2 pl-4" style={{ borderColor: subject.color }}>
          {subject.milestones.map((m) => (
            <li key={m.date} className="relative text-sm">
              <span
                aria-hidden
                className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 bg-card"
                style={{ borderColor: subject.color }}
              />
              <span className="text-foreground/60">{day(m.date)} · </span>
              {m.text}
              <span className="ml-2 rounded bg-foreground/5 px-1.5 py-0.5 text-xs text-foreground/60">Grade {m.grade}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
