import { notFound } from "next/navigation";
import { demoToolsEnabled } from "../../../lib/parent/demo";
import { getInsightsDb } from "../../../server/storage";
import { activityReport } from "../../../server/storage/insights";
import type { StoreDb } from "../../../server/storage/postgres";
import { AutoRefresh } from "./auto-refresh";

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
    return <p className="text-foreground/70">Insights need the database (PIPELINE_STORE=postgres).</p>;
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
    <div className="space-y-6">
      <AutoRefresh seconds={5} />
      <header className="space-y-1">
        <p className="text-sm text-foreground/60">Demo insights · team view</p>
        <h1 className="text-2xl font-semibold">Learning activity</h1>
        <p className="text-sm text-foreground/70">
          Every session start and saved answer is an event in the <code>learning_events</code>{" "}
          {report.engine === "timescaledb" ? "TimescaleDB hypertable on Tiger Cloud" : "table"},
          grouped into {report.bucketMinutes}-minute buckets with{" "}
          <code>{report.engine === "timescaledb" ? "time_bucket()" : "date_bin()"}</code> over the
          last {report.sinceMinutes} minutes. Aggregate counts only, not a claim about any child.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Sessions", t.sessionsStarted],
          ["Answers", t.answers],
          ["Incorrect", t.incorrect],
          ["With assistance", t.withAssistance],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-foreground/15 p-3">
            <dt className="text-xs text-foreground/60">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {report.buckets.length === 0 ? (
        <p className="text-foreground/70">No activity in this window yet.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-foreground/60">
            <tr>
              <th className="py-1 font-normal">Time</th>
              <th className="py-1 text-right font-normal">Sessions</th>
              <th className="py-1 text-right font-normal">Answers</th>
              <th className="py-1 text-right font-normal">Correct</th>
              <th className="py-1 text-right font-normal">Incorrect</th>
              <th className="py-1 text-right font-normal">Other</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((b) => (
              <tr key={b.bucketStart} className="border-t border-foreground/10">
                <td className="py-1">{fmt.format(new Date(b.bucketStart))}</td>
                <td className="py-1 text-right">{b.sessionsStarted}</td>
                <td className="py-1 text-right">{b.answers}</td>
                <td className="py-1 text-right">{b.correct}</td>
                <td className="py-1 text-right">{b.incorrect}</td>
                <td className="py-1 text-right">{b.other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
