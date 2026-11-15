import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { createMemoryLanguageLessonStore, createPostgresLanguageLessonStore } from "./language-lessons";
import { languageLessons, type PracticeEvidence } from "../../lib/play/language-lessons";
import type { StoreDb } from "./postgres";
import * as schema from "./schema";

const id = "demo-addition-1";
describe.each([
  ["memory", async () => { const store = createMemoryLanguageLessonStore(); return { store, reopen: () => store }; }],
  ["postgres", async () => { const db = drizzle(new PGlite(), { schema }); await migrate(db, { migrationsFolder: "./drizzle" }); return { store: createPostgresLanguageLessonStore(db as unknown as StoreDb), reopen: () => createPostgresLanguageLessonStore(db as unknown as StoreDb) }; }],
] as const)("%s language lesson progress", (_name, make) => {
  it("creates, reads, reduces, removes and restores lessons without losing another language", async () => {
    const { store, reopen } = await make();
    await store.write({ language: "es", lessonId: id, level: 2 }, true);
    await store.write({ language: "hi", lessonId: id, level: 3 }, true);
    expect((await reopen().list("es")).find(l => l.lessonId === id)?.level).toBe(2);
    await store.write({ language: "hi", lessonId: id, level: 1 });
    expect((await reopen().list("hi")).find(l => l.lessonId === id)).toMatchObject({ level: 1, source: "parent" });
    await store.write({ language: "hi", lessonId: id, active: false });
    expect((await store.list("hi")).find(l => l.lessonId === id)).toMatchObject({ level: 1, active: false });
    await store.write({ language: "hi", lessonId: id, active: true });
    expect((await reopen().list("hi")).find(l => l.lessonId === id)).toMatchObject({ level: 1, active: true });
    await store.deleteOverride("hi", id);
    expect((await store.list("hi")).find(l => l.lessonId === id)).toMatchObject({ level: 0, source: "new" });
    expect((await store.list("es")).find(l => l.lessonId === id)?.level).toBe(2);
    await expect(store.write({ language: "es", lessonId: id, level: 0 }, true)).rejects.toThrow();
  });
});
it("lowering a lesson ignores older success, preserves evidence, and allows new practice to advance it", () => {
  const evidence: PracticeEvidence[] = [1,2].map(n => ({ sessionId: `view-${n}`, spotId: id, endedAt: n, practiceLanguage: "hi", practiceWord: "तीन", practiceOutcome: "good" }));
  const original = JSON.stringify(evidence);
  expect(languageLessons("hi", evidence, []).find(l => l.lessonId === id)?.level).toBe(3);
  const override = { language: "hi" as const, lessonId: id, level: 1 as const, active: true, updatedAt: 10, levelSetAt: 10 };
  expect(languageLessons("hi", evidence, [override]).find(l => l.lessonId === id)?.level).toBe(1);
  expect(JSON.stringify(evidence)).toBe(original);
  expect(languageLessons("hi", [...evidence, { ...evidence[0]!, sessionId: "new-view", endedAt: 11 }], [override]).find(l => l.lessonId === id)?.level).toBe(2);
});
