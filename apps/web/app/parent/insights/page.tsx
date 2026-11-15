import { notFound } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { demoToolsEnabled } from "../../../lib/parent/demo";
import { getInsightsDb } from "../../../server/storage";
import { activityReport } from "../../../server/storage/insights";
import type { StoreDb } from "../../../server/storage/postgres";
import { AutoRefresh } from "../_components/auto-refresh";
import { PANEL } from "../_components/panel";
import { EmptyState } from "../_components/states";

export const dynamic = "force-dynamic";

// Team/demo view (DEMO_TOOLS=true). Aggregate across all sessions: counts what happened,
// it makes no learning claim about any child.
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; since?: string; sample?: string }>;
}) {
  if (!demoToolsEnabled()) notFound();
  const db = getInsightsDb();
  if (!db) {
    return <EmptyState>Insights need the database (PIPELINE_STORE=postgres).</EmptyState>;
  }
  const q = await searchParams;
  const report = await activityReport(db as unknown as StoreDb, {
    bucketMinutes: Number(q.bucket ?? 5),
    sinceMinutes: Number(q.since ?? 180),
    includeSample: q.sample === "1",
  });
  const t = report.totals;
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      <AutoRefresh seconds={5} />
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground">Demo insights · team view</p>
        <h1 className="font-display text-4xl font-bold">Learning activity</h1>
        <p className="mt-2 text-muted-foreground">
          Every session start and saved answer is an event in the <code>learning_events</code>{" "}
          {report.engine === "timescaledb" ? "TimescaleDB hypertable on Tiger Cloud" : "table"},
          grouped into {report.bucketMinutes}-minute buckets with{" "}
          <code>{report.engine === "timescaledb" ? "time_bucket()" : "date_bin()"}</code> over the
          last {report.sinceMinutes} minutes. Aggregate counts only, not a claim about any child.
        </p>
      </header>

      <div className={`${PANEL} flex flex-col gap-5`}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Sessions", t.sessionsStarted],
          ["Answers", t.answers],
          ["Incorrect", t.incorrect],
          ["With assistance", t.withAssistance],
        ].map(([label, value]) => (
          <li key={label}>
            <Card className="px-4 py-3">
              <CardHeader className="gap-0 px-0">
                <CardTitle className="text-2xl leading-[1.35] tabular-nums">{value}</CardTitle>
                <CardDescription className="text-xs">{label}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>

      {report.buckets.length === 0 ? (
        <p className="text-muted-foreground">No activity in this window yet.</p>
      ) : (
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Answers</TableHead>
              <TableHead className="text-right">Correct</TableHead>
              <TableHead className="text-right">Incorrect</TableHead>
              <TableHead className="text-right">Other</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.buckets.map((b) => (
              <TableRow key={b.bucketStart}>
                <TableCell>{fmt.format(new Date(b.bucketStart))}</TableCell>
                <TableCell className="text-right">{b.sessionsStarted}</TableCell>
                <TableCell className="text-right">{b.answers}</TableCell>
                <TableCell className="text-right">{b.correct}</TableCell>
                <TableCell className="text-right">{b.incorrect}</TableCell>
                <TableCell className="text-right">{b.other}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </div>
    </div>
  );
}
