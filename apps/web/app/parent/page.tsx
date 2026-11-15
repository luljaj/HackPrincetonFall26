import { cn } from "cn";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { childName } from "../../lib/parent/child";
import { demoToolsEnabled } from "../../lib/parent/demo";
import { getParentViewReader } from "../../lib/parent/reader";
import { showFor } from "../../lib/parent/shows";
import { parentStats } from "../../lib/parent/stats";
import type { ParentView } from "../../lib/parent/types";
import { AFTER_HELP_CHIP, SNAPSHOT_NOTE, statsLabels, statusChip } from "../../lib/parent/wording";
import { AutoRefresh } from "./_components/auto-refresh";
import { TAB_HEIGHT, TAB_WIDTH, TabPanelOutline } from "./_components/tab-panel-outline";
import { ChartIcon, EpisodesIcon, FamilyIcon, HelpIcon, QuestionsIcon } from "./_components/tv-icons";

export const dynamic = "force-dynamic";

// "Watched 1 day ago", as on the show cards.
function watchedAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "Watching now";
  if (mins < 60) return `Watched ${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Watched ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Watched ${days} ${days === 1 ? "day" : "days"} ago`;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statIcons = { sessions: EpisodesIcon, answered: QuestionsIcon, correctAfterHelp: HelpIcon } as const;

// Parent home in the Tellavision look: pick a show card and it joins up with the insights panel.
export default async function ParentHome({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show: selectedId } = await searchParams;
  const name = childName();
  const views = await getParentViewReader().listParentViews(20);
  const selected = views.find((v) => v.progress.sessionId === selectedId) ?? null;
  const others = views.filter((v) => v !== selected);

  return (
    <div className="tv-home flex flex-col font-lexend text-sm leading-[1.35] font-medium lg:h-[calc(100dvh-3rem)] lg:min-h-[640px]">
      <AutoRefresh seconds={5} />

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col items-start gap-2.5">
          <p className="font-display text-xl font-bold text-[#161616]">Tellavision</p>
          <Badge className="gap-2.5 px-[9px] py-1 text-base text-tv-badge [--r:11px] [&>svg]:size-5">
            <FamilyIcon />
            Parent View
          </Badge>
        </div>
        <nav className="flex flex-col items-end gap-3">
          <p className="text-base">Go to</p>
          <div className="flex flex-col items-end gap-[7px]">
            <Badge asChild variant="outline">
              <Link href="/parent/live">Live now</Link>
            </Badge>
            <Badge asChild variant="outline">
              <Link href="/parent/preview">By subject (sample)</Link>
            </Badge>
            {demoToolsEnabled() && (
              <Badge asChild variant="outline">
                <Link href="/parent/insights">Insights</Link>
              </Badge>
            )}
          </div>
        </nav>
      </header>

      <h1 className="mt-3 font-display text-4xl font-bold">{name}&apos;s Learning Moments</h1>
      <p className="mt-4 text-muted-foreground">Previously watched</p>

      {selected ? (
        // One shape: the selected show's tab and the insights panel share the outline behind them.
        <section className="relative mt-3.5 flex min-h-0 flex-1 flex-col">
          <TabPanelOutline art={showFor(selected.sceneId).art} />
          <div className="relative flex flex-wrap items-start gap-[30px]">
            <ShowTab view={selected} />
            {others.map((v) => (
              <ShowCard key={v.progress.sessionId} view={v} compact />
            ))}
          </div>
          <Insights view={selected} name={name} />
        </section>
      ) : (
        <>
          <section className="mt-3.5 flex flex-wrap items-start gap-[30px]">
            {views.map((v, idx) => (
              <ShowCard key={v.progress.sessionId} view={v} featured={idx === 0} />
            ))}
            {views.length === 0 && <p className="py-10 text-muted-foreground">Nothing watched yet.</p>}
          </section>
          <Empty className="mt-[18px] min-h-[160px] gap-[21px] p-10 md:p-10">
            <EmptyHeader>
              <EmptyMedia className="mb-0">
                <ChartIcon />
              </EmptyMedia>
              <EmptyDescription className="text-sm/[1.35] text-muted-foreground/70">
                Select a show to view insights
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </>
      )}

      <p className="mt-4 shrink-0 text-xs text-muted-foreground">{SNAPSHOT_NOTE}</p>
    </div>
  );
}

function ShowTitle({ view }: { view: ParentView }) {
  return (
    <div>
      <h2 className="font-display text-[32px] font-bold">{showFor(view.sceneId).show}</h2>
      <p className="flex flex-wrap items-center gap-2">
        {watchedAgo(view.startedAt)}
        {view.isSample && <Badge variant="outline">Sample data</Badge>}
      </p>
    </div>
  );
}

function PlayButton({ raised = false }: { raised?: boolean }) {
  return (
    <Button
      asChild
      className={cn("pointer-events-auto h-auto px-[34px] py-2.5", raised && "border border-border shadow-tv-button")}
    >
      <Link href="/">Play</Link>
    </Button>
  );
}

/** A show that isn't selected: a plain grey card. The grey stands in until the show has artwork. */
function ShowCard({
  view,
  featured = false,
  compact = false,
}: {
  view: ParentView;
  featured?: boolean;
  compact?: boolean;
}) {
  const show = showFor(view.sceneId);
  return (
    <article
      className={cn(
        "sq relative flex flex-col bg-muted pr-[37px] pl-7 shadow-tv-halo [--r:48px]",
        compact ? "h-[141px] justify-center" : "h-[283px] justify-end pb-[35px]",
        featured ? "w-full max-w-[427px]" : "w-[283px]",
      )}
    >
      <Link
        aria-label={`View insights for ${show.show}`}
        className="sq absolute inset-0 [--r:48px]"
        href={`/parent?show=${view.progress.sessionId}`}
        scroll={false}
      />
      <div className="pointer-events-none relative flex items-end justify-between gap-4">
        <ShowTitle view={view} />
        {featured && <PlayButton />}
      </div>
    </article>
  );
}

/** The selected show: the tab on top of the insights panel. Its background is TabPanelOutline. */
function ShowTab({ view }: { view: ParentView }) {
  const show = showFor(view.sceneId);
  return (
    <article
      className="relative flex w-full shrink-0 items-start pt-9 pr-7 pl-[37px]"
      style={{ maxWidth: TAB_WIDTH, height: TAB_HEIGHT }}
    >
      <Link aria-label={`Hide insights for ${show.show}`} className="absolute inset-0" href="/parent" scroll={false} />
      <div className="pointer-events-none relative flex w-full items-end justify-between gap-4">
        <ShowTitle view={view} />
        <PlayButton raised />
      </div>
    </article>
  );
}

function Insights({ view, name }: { view: ParentView; name: string }) {
  const stats = parentStats([view]);
  const labels = statsLabels();
  const show = showFor(view.sceneId);
  const { interactions, activeQuestion, episode, sessionId } = view.progress;

  return (
    <div className="relative grid min-h-0 flex-1 gap-x-10 gap-y-3 px-[34px] pt-4 pb-5 lg:grid-cols-[160px_1fr] lg:grid-rows-[auto_minmax(0,1fr)]">
      <h2 className="font-display text-2xl font-bold lg:col-span-2">{name}&apos;s Learning Moments</h2>

      <ul className="grid content-start gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => {
          const Icon = statIcons[k];
          return (
            <li key={k}>
              <Card className="h-[82px] flex-row items-center gap-[18px] px-4 py-2">
                <Icon />
                <CardHeader className="min-w-0 flex-1 gap-0 px-0">
                  <CardTitle className="text-2xl leading-[1.35] tabular-nums">{stats[k]}</CardTitle>
                  <CardDescription className="text-xs">{sentence(labels[k])}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-0 flex-col gap-2">
        <p className="text-muted-foreground">
          {[show.episode, episode.parentSummary ?? "No answer was heard in this session yet."]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {interactions.map((i) => {
            const chip = statusChip(i.assessment.answerStatus);
            return (
              <li key={i.interactionId}>
                <Card className="gap-1 px-4 py-3">
                  <CardHeader className="gap-0 px-0">
                    <CardDescription className="text-xs">{show.show} asked</CardDescription>
                    <CardTitle className="font-lexend text-sm leading-[1.35] font-medium">
                      {i.questionText}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 px-0">
                    <span className="font-display text-base font-bold">
                      {i.transcript ? `“${i.transcript}”` : "Nothing heard"}
                    </span>
                    <Badge variant={chip.tone === "good" ? "default" : "outline"}>{chip.label}</Badge>
                    {i.assessment.assistanceBeforeAnswer && (
                      <Badge variant="outline">{sentence(AFTER_HELP_CHIP)}</Badge>
                    )}
                  </CardContent>
                  <CardFooter className="px-0 text-xs text-muted-foreground">
                    {show.show} replied: {i.responseText}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
          {activeQuestion && (
            <li>
              <Card className="px-4 py-3 text-muted-foreground">
                <CardContent className="px-0">
                  {show.show} is asking: “{activeQuestion.text}” · waiting for the answer
                </CardContent>
              </Card>
            </li>
          )}
        </ol>
        <Badge asChild variant="outline" className="mt-1 self-end">
          <Link href={`/parent/${sessionId}`}>Open this session</Link>
        </Badge>
      </div>
    </div>
  );
}
