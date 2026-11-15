import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { foldSession, type PlayBatch, type PlayEvent, type PlaySessionSummary, type PlayTurn } from "../../lib/play/trace";
import { masteryFrom, type Mastery } from "../../lib/play/mastery";
import { PersistenceError } from "./contract";
import type { StoreDb } from "./postgres";
import { playEvents, playSessions, playTurns } from "./schema";

export type PlaySessionRecord = { session: PlaySessionSummary; turns: PlayTurn[] };
export type PracticeRow = { language: string; words: string[]; tried: number; saidIt: number; lastSeen: number };
export type TopicRow = { topic: string; subject: string; questions: number; firstTry: number; afterHelp: number; gave: number; noAnswer: number; lastSeen: number };

export type PlayStore = {
  /** Saves a batch (duplicates ignored), re-folds the session, returns its current state. */
  ingest(batch: PlayBatch): Promise<PlaySessionRecord>;
  list(limit: number): Promise<PlaySessionRecord[]>;
  get(sessionId: string): Promise<PlaySessionRecord | null>;
  /** Finished pauses grouped by topic, across all sessions. */
  topics(): Promise<TopicRow[]>;
  /** Skill levels per mastery category, and word levels per language (lib/play/mastery.ts). */
  mastery(): Promise<Mastery>;
  /** Words practised in another language, grouped by language. */
  practice(): Promise<PracticeRow[]>;
  /** Deletes one viewing's whole trace (session, events, turns). False if it didn't exist. */
  delete(sessionId: string): Promise<boolean>;
  /** Deletes every play trace. Returns how many viewings were removed. */
  deleteAll(): Promise<number>;
};

export const TRANSCRIPT_DAYS = 30;
const SWEEP_MS = 60 * 60 * 1000;
let lastSweep = 0; // ponytail: per server process; a scheduled job if this ever runs on many servers

/** Same grouping as the SQL in topics(), for the memory store and tests. */
export function topicRows(turns: readonly PlayTurn[]): TopicRow[] {
  const rows = new Map<string, TopicRow>();
  for (const t of turns) {
    if (!t.outcome || t.outcome === "error") continue;
    const r = rows.get(t.topic) ?? { topic: t.topic, subject: t.subject, questions: 0, firstTry: 0, afterHelp: 0, gave: 0, noAnswer: 0, lastSeen: 0 };
    r.questions++;
    if (t.outcome === "first_try") r.firstTry++;
    if (t.outcome === "after_help") r.afterHelp++;
    if (t.outcome === "gave") r.gave++;
    if (t.outcome === "no_answer") r.noAnswer++;
    r.lastSeen = Math.max(r.lastSeen, t.endedAt);
    rows.set(t.topic, r);
  }
  return [...rows.values()].sort((a, b) => b.questions - a.questions);
}

/** Same grouping as the SQL in practice(). */
export function practiceRows(turns: readonly PlayTurn[]): PracticeRow[] {
  const rows = new Map<string, PracticeRow>();
  for (const t of turns) {
    if (!t.practiceLanguage || !t.practiceOutcome) continue;
    const r = rows.get(t.practiceLanguage) ?? { language: t.practiceLanguage, words: [], tried: 0, saidIt: 0, lastSeen: 0 };
    r.tried++;
    if (t.practiceOutcome === "good") r.saidIt++;
    if (t.practiceWord && !r.words.includes(t.practiceWord)) r.words.push(t.practiceWord);
    r.lastSeen = Math.max(r.lastSeen, t.endedAt);
    rows.set(t.practiceLanguage, r);
  }
  return [...rows.values()];
}

const ms = (d: Date | null) => (d ? d.getTime() : null);

export function createPostgresPlayStore(db: StoreDb): PlayStore {
  const turnsFor = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, PlayTurn[]>();
    const rows = await db.select().from(playTurns).where(inArray(playTurns.sessionId, ids)).orderBy(asc(playTurns.turnNumber));
    const out = new Map<string, PlayTurn[]>();
    for (const r of rows) {
      const t: PlayTurn = {
        ...r,
        startedAt: r.startedAt.getTime(),
        endedAt: r.endedAt.getTime(),
        outcome: r.outcome as PlayTurn["outcome"],
        answerStatus: r.answerStatus as PlayTurn["answerStatus"],
        practiceOutcome: r.practiceOutcome as PlayTurn["practiceOutcome"],
      };
      out.set(r.sessionId, [...(out.get(r.sessionId) ?? []), t]);
    }
    return out;
  };
  const toSummary = (r: typeof playSessions.$inferSelect): PlaySessionSummary => ({
    sessionId: r.sessionId, episodeId: r.episodeId, language: r.language, startedAt: r.startedAt.getTime(),
    lastEventAt: r.lastEventAt.getTime(), endedAt: ms(r.endedAt), watchedSeconds: r.watchedSeconds,
  });

  return {
    async ingest(batch) {
      // Retention: what the kid said is kept TRANSCRIPT_DAYS, then blanked (turns) and removed (events).
      // Batches arrive every 2 s; the sweep only needs to run about once an hour per server.
      const sweep = Date.now() - lastSweep > SWEEP_MS;
      try {
        const saved = await db.transaction(async (tx) => {
          const first = Math.min(...batch.events.map((e) => e.at));
          await tx
            .insert(playSessions)
            .values({ sessionId: batch.sessionId, episodeId: batch.episodeId, startedAt: new Date(first), lastEventAt: new Date(first) })
            .onConflictDoNothing();
          await tx
            .insert(playEvents)
            .values(batch.events.map((e) => ({ eventTime: new Date(e.at), sessionId: batch.sessionId, seq: e.seq, eventType: e.type, turnId: e.turnId ?? null, payload: e })))
            .onConflictDoNothing();
          // ponytail: re-folds the whole session per batch (a few hundred events); fold incrementally if sessions get long
          const events = (
            await tx.select({ payload: playEvents.payload }).from(playEvents).where(eq(playEvents.sessionId, batch.sessionId)).orderBy(asc(playEvents.seq))
          ).map((r) => r.payload as PlayEvent);
          const { session, turns } = foldSession(batch.sessionId, batch.episodeId, events);
          await tx
            .update(playSessions)
            .set({ language: session.language, startedAt: new Date(session.startedAt), lastEventAt: new Date(session.lastEventAt), endedAt: session.endedAt ? new Date(session.endedAt) : null, watchedSeconds: session.watchedSeconds === null ? null : Math.round(session.watchedSeconds) })
            .where(eq(playSessions.sessionId, batch.sessionId));
          for (const t of turns) {
            const row = { ...t, sessionId: batch.sessionId, startedAt: new Date(t.startedAt), endedAt: new Date(t.endedAt) };
            await tx.insert(playTurns).values(row).onConflictDoUpdate({ target: playTurns.turnId, set: row });
          }
          if (sweep) {
            const cutoff = new Date(Date.now() - TRANSCRIPT_DAYS * 86_400_000);
            await tx.update(playTurns).set({ transcript: "" }).where(and(lt(playTurns.endedAt, cutoff), ne(playTurns.transcript, "")));
            await tx.execute(sql`UPDATE play_events SET payload = payload - 'text' WHERE event_time < ${cutoff.toISOString()} AND payload ? 'text'`);
          }
          return { session, turns };
        });
        if (sweep) lastSweep = Date.now(); // only once it committed: a rolled-back sweep runs again next batch
        return saved;
      } catch (e) {
        throw new PersistenceError("Could not save play events", { cause: e });
      }
    },
    async list(limit) {
      const rows = await db.select().from(playSessions).orderBy(desc(playSessions.lastEventAt)).limit(limit);
      const turns = await turnsFor(rows.map((r) => r.sessionId));
      return rows.map((r) => ({ session: toSummary(r), turns: turns.get(r.sessionId) ?? [] }));
    },
    async get(sessionId) {
      const [row] = await db.select().from(playSessions).where(eq(playSessions.sessionId, sessionId));
      if (!row) return null;
      return { session: toSummary(row), turns: (await turnsFor([sessionId])).get(sessionId) ?? [] };
    },
    async topics() {
      const rows = await db
        .select({
          topic: playTurns.topic,
          subject: sql<string>`min(${playTurns.subject})`,
          questions: sql<number>`count(*)::int`,
          firstTry: sql<number>`count(*) filter (where ${playTurns.outcome} = 'first_try')::int`,
          afterHelp: sql<number>`count(*) filter (where ${playTurns.outcome} = 'after_help')::int`,
          gave: sql<number>`count(*) filter (where ${playTurns.outcome} = 'gave')::int`,
          noAnswer: sql<number>`count(*) filter (where ${playTurns.outcome} = 'no_answer')::int`,
          lastSeen: sql<Date>`max(${playTurns.endedAt})`,
        })
        .from(playTurns)
        .where(inArray(playTurns.outcome, ["first_try", "after_help", "gave", "no_answer"]))
        .groupBy(playTurns.topic)
        .orderBy(desc(sql`count(*)`));
      return rows.map((r) => ({ ...r, lastSeen: new Date(r.lastSeen).getTime() }));
    },
    async mastery() {
      // ponytail: reads every finished turn; aggregate in SQL once history is thousands of turns
      const rows = await db
        .select({
          sessionId: playTurns.sessionId, spotId: playTurns.spotId, outcome: playTurns.outcome, endedAt: playTurns.endedAt,
          practiceLanguage: playTurns.practiceLanguage, practiceWord: playTurns.practiceWord, practiceOutcome: playTurns.practiceOutcome,
        })
        .from(playTurns)
        .where(sql`${playTurns.outcome} is not null or ${playTurns.practiceWord} is not null`);
      return masteryFrom(rows.map((r) => ({ ...r, endedAt: r.endedAt.getTime() })));
    },
    async delete(sessionId) {
      // Events and turns go with it (ON DELETE CASCADE).
      const gone = await db.delete(playSessions).where(eq(playSessions.sessionId, sessionId)).returning({ id: playSessions.sessionId });
      return gone.length > 0;
    },
    async deleteAll() {
      return (await db.delete(playSessions).returning({ id: playSessions.sessionId })).length;
    },
    async practice() {
      const rows = await db
        .select({
          language: sql<string>`${playTurns.practiceLanguage}`,
          words: sql<string[]>`coalesce(array_agg(distinct ${playTurns.practiceWord}) filter (where ${playTurns.practiceWord} is not null), '{}')`,
          tried: sql<number>`count(*)::int`,
          saidIt: sql<number>`count(*) filter (where ${playTurns.practiceOutcome} = 'good')::int`,
          lastSeen: sql<Date>`max(${playTurns.endedAt})`,
        })
        .from(playTurns)
        .where(sql`${playTurns.practiceLanguage} is not null and ${playTurns.practiceOutcome} is not null`)
        .groupBy(playTurns.practiceLanguage);
      return rows.map((r) => ({ ...r, lastSeen: new Date(r.lastSeen).getTime() }));
    },
  };
}

/** Used when no database is configured: lives until the server restarts. */
export function createMemoryPlayStore(): PlayStore {
  const events = new Map<string, { episodeId: string; bySeq: Map<number, PlayEvent> }>();
  const records = new Map<string, PlaySessionRecord>();
  return {
    async ingest(batch) {
      const s = events.get(batch.sessionId) ?? { episodeId: batch.episodeId, bySeq: new Map() };
      for (const e of batch.events) if (!s.bySeq.has(e.seq)) s.bySeq.set(e.seq, e);
      events.set(batch.sessionId, s);
      const record = foldSession(batch.sessionId, s.episodeId, [...s.bySeq.values()]);
      records.set(batch.sessionId, record);
      return record;
    },
    async list(limit) {
      return [...records.values()].sort((a, b) => b.session.lastEventAt - a.session.lastEventAt).slice(0, limit);
    },
    async get(sessionId) {
      return records.get(sessionId) ?? null;
    },
    async topics() {
      return topicRows([...records.values()].flatMap((r) => r.turns));
    },
    async practice() {
      return practiceRows([...records.values()].flatMap((r) => r.turns));
    },
    async mastery() {
      return masteryFrom([...records.values()].flatMap((r) => r.turns.map((t) => ({ ...t, sessionId: r.session.sessionId }))));
    },
    async delete(sessionId) {
      events.delete(sessionId);
      return records.delete(sessionId);
    },
    async deleteAll() {
      const n = records.size;
      events.clear();
      records.clear();
      return n;
    },
  };
}
