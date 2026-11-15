import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  gradeProgress,
  PREVIEW_CHILD,
  PREVIEW_PERIOD,
  PREVIEW_SUBJECTS,
  SKILL_STATUS_LABEL,
  type PreviewSubject,
  type SkillStatus,
} from "../../../lib/parent/preview-data";
import { getParentViewReader } from "../../../lib/parent/reader";
import { AFTER_HELP_CHIP, statusChip, type ChipTone } from "../../../lib/parent/wording";
import { Chip } from "../_components/chip";
import { PANEL } from "../_components/panel";

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

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col items-start gap-1">
        <Badge asChild variant="outline">
          <Link href="/parent">← Back to real sessions</Link>
        </Badge>
        <h1 className="mt-2 font-display text-4xl font-bold">
          {PREVIEW_CHILD}&apos;s Learning by Subject
        </h1>
        <p className="text-muted-foreground">{PREVIEW_PERIOD}</p>
      </header>

      <Alert role="note" className="max-w-[880px]">
        <AlertTitle className="line-clamp-none">Preview with sample data</AlertTitle>
        <AlertDescription>
          How {PREVIEW_CHILD}&apos;s view could look after a few weeks of watching. These subjects,
          skills and sessions are made up for the demo. Only the &ldquo;Live today&rdquo; box under
          Math shows real sessions.
        </AlertDescription>
      </Alert>

      <nav className="flex flex-wrap gap-[7px]" aria-label="Subjects">
        {PREVIEW_SUBJECTS.map((s) => (
          <Badge key={s.id} asChild variant="outline" className="px-3 py-1 text-sm">
            <a href={`#${s.id}`}>{s.name}</a>
          </Badge>
        ))}
      </nav>

      {PREVIEW_SUBJECTS.map((s) => (
        <SubjectSection key={s.id} subject={s} liveCount={s.id === "math" ? realMath.length : null} />
      ))}

      <p className="text-xs text-muted-foreground">
        Sample data for the demo. A real view would only show what was actually heard and saved,
        and a single answer is a snapshot, not a measure of mastery.
      </p>
    </div>
  );
}

function SubjectSection({ subject, liveCount }: { subject: PreviewSubject; liveCount: number | null }) {
  return (
    <section id={subject.id} className={`${PANEL} grid scroll-mt-6 gap-x-8 gap-y-5 lg:grid-cols-2`}>
      <div className="flex flex-col gap-1 lg:col-span-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[32px] font-bold">{subject.name}</h2>
          <Badge variant="outline">Sample</Badge>
        </div>
        <p className="text-base">{subject.headline}</p>
      </div>

      <div className="flex flex-col gap-3 lg:col-span-2">
        <GradePath subject={subject} />

      {liveCount !== null && (
        <Card className="gap-1 border-2 border-primary px-5 py-4">
          <CardHeader className="px-0">
            <CardTitle className="font-lexend text-sm leading-[1.35] font-medium">
              Live today: real Dora counting sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 px-0 text-muted-foreground">
            {liveCount === 0
              ? "Today's Dora apple-counting moments will appear here as real Math sessions."
              : `${liveCount} real session${liveCount === 1 ? "" : "s"} from today's demo count toward Math.`}
            <Badge asChild variant="outline">
              <Link href="/parent">See them</Link>
            </Badge>
          </CardContent>
        </Card>
      )}
      </div>

      <div>
        <h3 className="mb-2 text-muted-foreground">Skills</h3>
        <ul className="flex flex-col gap-2">
          {subject.skills.map((k) => (
            <li key={k.name}>
              <Card className="flex-row flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="shadow-none">Grade {k.grade}</Badge>
                  {k.name}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {k.tries > 0 ? `${k.tries} tries` : ""}
                  <Chip tone={SKILL_TONE[k.status]}>{SKILL_STATUS_LABEL[k.status]}</Chip>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-muted-foreground">Recent moments (sample)</h3>
        <ol className="flex flex-col gap-2">
          {subject.sessions.map((m) => {
            const chip = statusChip(m.status);
            return (
              <li key={m.date}>
                <Card className="gap-1 px-4 py-3">
                  <CardHeader className="gap-0 px-0">
                    <CardDescription className="text-xs">
                      {m.show} · {day(m.date)}
                    </CardDescription>
                    <CardTitle className="font-lexend text-sm leading-[1.35] font-medium">{m.question}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 px-0">
                    <span className="font-display text-base font-bold">“{m.answer}”</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                    {m.afterHelp && <Chip tone="muted">{AFTER_HELP_CHIP}</Chip>}
                  </CardContent>
                  <CardFooter className="px-0 text-xs text-muted-foreground">{m.summary}</CardFooter>
                </Card>
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
    <div className="flex flex-col gap-2" aria-label={`${subject.name} grade path`}>
      <h3 className="text-muted-foreground">
        Grade path: Grade {subject.gradeFrom} → Grade {subject.gradeTo}
      </h3>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
          <span>{r.label}</span>
          {/* Thick rounded bar, yellow for progress, as the design asks of charts. */}
          <div className="h-3.5 overflow-hidden rounded-full border border-border bg-card/50">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${r.total ? (r.filled / r.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{r.note}</span>
        </div>
      ))}
    </div>
  );
}
