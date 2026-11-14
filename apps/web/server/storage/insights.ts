import { sql } from "drizzle-orm";
import type { StoreDb } from "./postgres";
import { PersistenceError } from "./contract";

// Aggregate activity over the learning_events hypertable (team/demo view, not a per-child claim).
// On Tiger Cloud this uses TimescaleDB's time_bucket(); elsewhere it falls back to date_bin().

export type ActivityBucket = {
  bucketStart: string; // ISO
  sessionsStarted: number;
  answers: number;
  incorrect: number;
  correct: number;
  other: number; // unclear, off_topic, not_assessed
  withAssistance: number;
};

export type ActivityReport = {
  engine: "timescaledb" | "postgres";
  bucketMinutes: number;
  sinceMinutes: number;
  buckets: ActivityBucket[];
  totals: Omit<ActivityBucket, "bucketStart">;
};

type Row = Record<string, unknown>;

async function rowsOf(result: unknown): Promise<Row[]> {
  // postgres-js returns an array; PGlite returns { rows }.
  return Array.isArray(result) ? (result as Row[]) : ((result as { rows: Row[] }).rows ?? []);
}

const engineCache = new WeakMap<object, Promise<ActivityReport["engine"]>>();

export function detectEngine(db: StoreDb): Promise<ActivityReport["engine"]> {
  let cached = engineCache.get(db);
  if (!cached) {
    cached = db
      .execute(sql`select exists (select 1 from pg_extension where extname = 'timescaledb') as ts`)
      .then(rowsOf)
      .then((rows) => (rows[0]?.ts === true ? "timescaledb" : "postgres"));
    engineCache.set(db, cached);
  }
  return cached;
}

export async function activityReport(
  db: StoreDb,
  opts: { bucketMinutes?: number; sinceMinutes?: number; includeSample?: boolean; now?: Date } = {},
): Promise<ActivityReport> {
  const bucketMinutes = clampInt(opts.bucketMinutes ?? 5, 1, 1440);
  const sinceMinutes = clampInt(opts.sinceMinutes ?? 180, bucketMinutes, 60 * 24 * 30);
  const includeSample = opts.includeSample ?? false;
  const since = new Date((opts.now ?? new Date()).getTime() - sinceMinutes * 60_000);

  try {
    const engine = await detectEngine(db);
    const width = sql`make_interval(mins => ${bucketMinutes})`;
    const bucket =
      engine === "timescaledb"
        ? sql`time_bucket(${width}, event_time)`
        : sql`date_bin(${width}, event_time, timestamptz '2000-01-01')`;

    const rows = await rowsOf(
      await db.execute(sql`
        select ${bucket} as bucket_start,
          count(*) filter (where event_type = 'session_started')::int as sessions_started,
          count(*) filter (where event_type = 'answer_committed')::int as answers,
          count(*) filter (where answer_status = 'incorrect')::int as incorrect,
          count(*) filter (where answer_status = 'correct')::int as correct,
          count(*) filter (where event_type = 'answer_committed'
            and answer_status not in ('correct', 'incorrect'))::int as other,
          count(*) filter (where assistance_in_response)::int as with_assistance
        from learning_events
        where event_time >= ${since.toISOString()}::timestamptz
          and (${includeSample} or not is_sample)
        group by 1
        order by 1
      `),
    );

    const buckets = rows.map((r) => ({
      bucketStart: new Date(r.bucket_start as string | Date).toISOString(),
      sessionsStarted: Number(r.sessions_started),
      answers: Number(r.answers),
      incorrect: Number(r.incorrect),
      correct: Number(r.correct),
      other: Number(r.other),
      withAssistance: Number(r.with_assistance),
    }));
    const totals = buckets.reduce(
      (t, b) => ({
        sessionsStarted: t.sessionsStarted + b.sessionsStarted,
        answers: t.answers + b.answers,
        incorrect: t.incorrect + b.incorrect,
        correct: t.correct + b.correct,
        other: t.other + b.other,
        withAssistance: t.withAssistance + b.withAssistance,
      }),
      { sessionsStarted: 0, answers: 0, incorrect: 0, correct: 0, other: 0, withAssistance: 0 },
    );
    return { engine, bucketMinutes, sinceMinutes, buckets, totals };
  } catch (e) {
    throw new PersistenceError("Activity query failed", { cause: e });
  }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
}
