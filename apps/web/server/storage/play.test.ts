import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionProgressSchema } from "../../lib/contracts";
import { foldSession, type PlayBatch, type PlayEvent } from "../../lib/play/trace";
import { playToParentView } from "../../lib/play/view";
import { createMemoryPlayStore, createPostgresPlayStore, type PlayStore } from "./play";
import type { StoreDb } from "./postgres";
import * as schema from "./schema";
import { skillOf } from "../../lib/play/mastery";

const S = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const T2 = "33333333-3333-4333-8333-333333333333";
const T3 = "44444444-4444-4444-8444-444444444444";
const t0 = Date.parse("2026-11-14T18:00:00Z");

// One viewing: a first-try answer, a wrong-then-right answer with French practice, then silence.
function viewing(): PlayEvent[] {
  const out: Array<Omit<PlayEvent, "seq" | "at">> = [
    { type: "session_start", episodeId: "dora-ep3", language: "fr" },
    { type: "stage", turnId: T1, spotId: "ep3-02", stage: "entering", tries: 0, nudges: 0, modeled: false, practiced: false, question: "What shape is the window?", skill: "shapes" },
    { type: "stage", turnId: T1, spotId: "ep3-02", stage: "listening", tries: 0, nudges: 0, modeled: false, practiced: false },
    { type: "heard", turnId: T1, spotId: "ep3-02", text: "a circle" },
    { type: "judged", turnId: T1, spotId: "ep3-02", verdict: "correct", source: "instant" },
    { type: "stage", turnId: T1, spotId: "ep3-02", stage: "celebrating", tries: 0, nudges: 0, modeled: false, practiced: false },
    { type: "stage", turnId: T1, spotId: "ep3-02", stage: "watching", tries: 0, nudges: 0, modeled: false, practiced: false },
    { type: "stage", turnId: T2, spotId: "ep3-05", stage: "entering", tries: 0, nudges: 0, modeled: false, practiced: false, question: "How many stars?", skill: "counting", answer: "three", moment: 780.4 },
    { type: "heard", turnId: T2, spotId: "ep3-05", text: "five" },
    { type: "judged", turnId: T2, spotId: "ep3-05", verdict: "wrong", say: "Let's count together!", source: "luna", ms: 900 },
    { type: "stage", turnId: T2, spotId: "ep3-05", stage: "teaching", tries: 1, nudges: 0, modeled: false, practiced: false },
    { type: "heard", turnId: T2, spotId: "ep3-05", text: "three" },
    { type: "stage", turnId: T2, spotId: "ep3-05", stage: "celebrating", tries: 1, nudges: 0, modeled: false, practiced: false },
    { type: "stage", turnId: T2, spotId: "ep3-05", stage: "practicing", tries: 1, nudges: 0, modeled: false, practiced: false, word: "trois" },
    { type: "pronounced", turnId: T2, spotId: "ep3-05", verdict: "good" },
    { type: "stage", turnId: T2, spotId: "ep3-05", stage: "celebrating", tries: 1, nudges: 0, modeled: false, practiced: true },
    { type: "stage", turnId: T3, spotId: "ep3-09", stage: "entering", tries: 0, nudges: 0, modeled: false, practiced: false, question: "Where is Boots?", skill: "places" },
    { type: "stage", turnId: T3, spotId: "ep3-09", stage: "nudging", tries: 0, nudges: 1, modeled: false, practiced: false },
    { type: "stage", turnId: T3, spotId: "ep3-09", stage: "giving", tries: 0, nudges: 1, modeled: false, practiced: false },
    { type: "session_end", watchedSeconds: 600 },
  ];
  return out.map((e, i) => ({ ...e, seq: i, at: t0 + i * 1000 }));
}

const batch = (events: PlayEvent[]): PlayBatch => ({ sessionId: S, episodeId: "dora-ep3", events });

describe("foldSession", () => {
  it("turns events into one row per pause with the right outcome", () => {
    const { session, turns } = foldSession(S, "dora-ep3", viewing());
    expect(session).toMatchObject({ language: "fr", endedAt: t0 + 19_000, watchedSeconds: 600 });
    expect(turns.map((t) => [t.spotId, t.outcome, t.answerStatus, t.topic])).toEqual([
      ["ep3-02", "first_try", "correct", "Shapes"],
      ["ep3-05", "after_help", "correct", "Numbers"],
      ["ep3-09", "no_answer", "unclear", "Places"],
    ]);
    expect(turns[0]).toMatchObject({ expectedAnswer: null, momentSeconds: null });
    expect(turns[1]).toMatchObject({ expectedAnswer: "three", momentSeconds: 780.4, tries: 1, transcript: "five / three", doraReply: "Let's count together!", practiceLanguage: "fr", practiceWord: "trois", practiceOutcome: "good", pronunciation: "good" });
  });

  it("is order-independent and clears the end when the kid comes back", () => {
    const events = viewing();
    const back: PlayEvent = { seq: 99, at: t0 + 60_000, type: "language", language: "" };
    const { session } = foldSession(S, "dora-ep3", [back, ...events.reverse()]);
    expect(session.endedAt).toBeNull();
  });

  it("maps to a ParentView that passes the shared progress contract", () => {
    const { session, turns } = foldSession(S, "dora-ep3", viewing());
    const view = playToParentView(session, turns);
    expect(() => SessionProgressSchema.parse(view.progress)).not.toThrow();
    expect(view.progress.episode.parentSummary).toBe(
      "3 questions at the pauses: 1 answered correctly before help, 1 after help. Said 1 word in French.",
    );
    expect(view.progress.episode.parentSummary).not.toMatch(/master|score|%/i);
    expect(view.progress.interactions[1]!.assessment.evidence).toBe(
      'Expected: three. At 13:00 in the episode. After 1 hint. Practised the French word "trois" and said it.',
    );
  });
});

describe.each([
  ["memory", async () => createMemoryPlayStore()],
  [
    "postgres",
    async () => {
      const db = drizzle(new PGlite(), { schema });
      await migrate(db, { migrationsFolder: "./drizzle" });
      return createPostgresPlayStore(db as unknown as StoreDb);
    },
  ],
] as const)("%s play store", (_name, make) => {
  let store: PlayStore;
  beforeEach(async () => {
    store = await make();
  });

  it("resets mastery without deleting saved pauses and resolves the latest skill", async () => {
    await store.ingest(batch(viewing()));
    const skill = skillOf("ep3-02")!;
    expect(await store.currentSkill()).toBe(skillOf("ep3-09"));
    expect((await store.mastery()).categories.flatMap(c => c.skills).find(s => s.id === skill)?.asked).toBe(1);
    await store.resetSkills([skill], t0 + 60_000);
    expect((await store.mastery()).categories.flatMap(c => c.skills).find(s => s.id === skill)).toMatchObject({ level: "new", asked: 0 });
    expect((await store.get(S))?.turns).toHaveLength(3);
    await store.ingest(batch(viewing()));
    expect((await store.mastery()).categories.flatMap(c => c.skills).find(s => s.id === skill)?.asked).toBe(0);
  });

  it("saves batches, ignores retried events, and groups topics", async () => {
    const events = viewing();
    await store.ingest(batch(events.slice(0, 10)));
    await store.ingest(batch(events.slice(5))); // overlapping retry
    const record = await store.get(S);
    expect(record?.turns.map((t) => t.outcome)).toEqual(["first_try", "after_help", "no_answer"]);
    expect(record?.turns[1]).toMatchObject({ expectedAnswer: "three", momentSeconds: 780.4 });
    expect((await store.list(10)).map((r) => r.session.sessionId)).toEqual([S]);
    const topics = await store.topics();
    expect(topics.map((t) => [t.topic, t.questions, t.firstTry, t.afterHelp, t.noAnswer]).sort()).toEqual([
      ["Numbers", 1, 0, 1, 0],
      ["Places", 1, 0, 0, 1],
      ["Shapes", 1, 1, 0, 0],
    ]);
    expect(await store.practice()).toMatchObject([{ language: "fr", words: ["trois"], tried: 1, saidIt: 1 }]);
  });

  it("deletes one trace, or all of them, with its events and turns", async () => {
    await store.ingest(batch(viewing()));
    await store.ingest({ ...batch(viewing()), sessionId: "55555555-5555-4555-8555-555555555555", events: viewing().map((e) => (e.turnId ? { ...e, turnId: e.turnId.replace(/^\d/, "9") } : e)) });
    expect(await store.delete(S)).toBe(true);
    expect(await store.delete(S)).toBe(false);
    expect(await store.get(S)).toBeNull();
    expect((await store.topics()).reduce((n, t) => n + t.questions, 0)).toBe(3); // only the other viewing's pauses left
    expect(await store.deleteAll()).toBe(1);
    expect(await store.list(10)).toEqual([]);
    expect(await store.topics()).toEqual([]);
  });
});

describe("older TV counting evidence", () => {
  it("includes committed real counting answers in Numbers, excludes samples, and preserves resets", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    for (const [sessionId, isSample] of [["old-tv", false], ["old-sample", true]] as const) {
      await db.insert(schema.sessions).values({ sessionId, sceneId: "demo-scene", objectiveId: "count-small-sets", sceneSnapshot: {}, isSample, createdAt: new Date(t0) });
      await db.insert(schema.interactions).values({ sessionId, interactionId: sessionId+"-answer", turnNumber: 1, sceneId: "demo-scene", objectiveId: "count-small-sets", questionId: "count", questionText: "How many apples?", answerGuide: "Two", transcript: "Two", responseType: "teaching", responseText: "Yes", answerStatus: "correct", assistanceBefore: true, assistanceInResponse: false, turnResponse: {}, completedAt: new Date(t0+1) });
    }
    const store = createPostgresPlayStore(db as unknown as StoreDb);
    expect((await store.mastery()).categories.flatMap(c => c.skills).find(s => s.id === "how-many")).toMatchObject({ asked: 1, firstTry: 0, level: "practising" });
    expect(await store.legacyEvidence()).toHaveLength(1);
    await store.resetSkills(["how-many"], t0+2);
    expect((await store.mastery()).categories.flatMap(c => c.skills).find(s => s.id === "how-many")?.asked).toBe(0);
    expect(await store.legacyEvidence()).toHaveLength(1);
  });
});
