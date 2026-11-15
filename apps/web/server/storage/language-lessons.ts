import { and, eq } from "drizzle-orm";
import { languageLessons, languageCatalog, LanguageCodeSchema, LessonLevelSchema, type LanguageCode, type LanguageLesson, type LessonOverride, type LessonWrite, type PracticeEvidence } from "../../lib/play/language-lessons";
import type { StoreDb } from "./postgres";
import { lessonProgress, playTurns, playSessions } from "./schema";

export class LessonConflict extends Error {}

export type LanguageLessonStore = {
  list(language: LanguageCode): Promise<LanguageLesson[]>;
  write(patch: LessonWrite, createOnly?: boolean): Promise<LanguageLesson>;
  deleteOverride(language: LanguageCode, lessonId: string): Promise<void>;
};
const requireLesson = (patch: { language: LanguageCode; lessonId: string }) => {
  if (!languageCatalog(patch.language).some(row => row.lessonId === patch.lessonId)) throw new Error("That lesson is not available in this language.");
};

export function createPostgresLanguageLessonStore(db: StoreDb): LanguageLessonStore {
  const learnerKey = "default";
  const store: LanguageLessonStore = {
    async list(language) {
      const [rows, observations] = await Promise.all([
        db.select().from(lessonProgress).where(and(eq(lessonProgress.learnerKey, learnerKey), eq(lessonProgress.language, language))),
        db.select({ sessionId: playTurns.sessionId, spotId: playTurns.spotId, endedAt: playTurns.endedAt, practiceLanguage: playTurns.practiceLanguage, practiceWord: playTurns.practiceWord, practiceOutcome: playTurns.practiceOutcome })
          .from(playTurns).innerJoin(playSessions, eq(playSessions.sessionId, playTurns.sessionId))
          .where(and(eq(playSessions.learnerKey, learnerKey), eq(playTurns.practiceLanguage, language))),
      ]);
      return languageLessons(language, observations.map(t => ({ ...t, endedAt: t.endedAt.getTime() })), rows.map(row => ({ ...row, language: LanguageCodeSchema.parse(row.language), level: row.level == null ? null : LessonLevelSchema.parse(row.level), updatedAt: row.updatedAt.getTime(), levelSetAt: row.levelSetAt?.getTime() ?? null })));
    },
    async write(patch, createOnly = false) {
      requireLesson(patch);
      const now = new Date();
      const values = { learnerKey, language: patch.language, lessonId: patch.lessonId, level: patch.level ?? null, levelSetAt: patch.level === undefined ? null : now, active: patch.active ?? true, updatedAt: now };
      const insertion = db.insert(lessonProgress).values(values);
      if (createOnly) {
        const inserted = await insertion.onConflictDoNothing().returning({ id: lessonProgress.lessonId });
        if (!inserted.length) throw new LessonConflict("Lesson progress already exists.");
      }
      else await insertion.onConflictDoUpdate({ target: [lessonProgress.learnerKey, lessonProgress.language, lessonProgress.lessonId], set: {
        ...(patch.level === undefined ? {} : { level: patch.level, levelSetAt: now }),
        ...(patch.active === undefined ? {} : { active: patch.active }), updatedAt: now,
      } });
      const row = (await store.list(patch.language)).find(row => row.lessonId === patch.lessonId);
      if (!row) throw new Error("The saved lesson could not be read.");
      return row;
    },
    async deleteOverride(language, lessonId) {
      await db.delete(lessonProgress).where(and(eq(lessonProgress.learnerKey, learnerKey), eq(lessonProgress.language, language), eq(lessonProgress.lessonId, lessonId)));
    },
  };
  return store;
}

export function createMemoryLanguageLessonStore(evidence: () => Promise<PracticeEvidence[]> = async () => []): LanguageLessonStore {
  const overrides = new Map<string, LessonOverride>();
  const key = (language: string, id: string) => `${language}:${id}`;
  const store: LanguageLessonStore = {
    async list(language) { return languageLessons(language, await evidence(), [...overrides.values()]); },
    async write(patch, createOnly = false) {
      requireLesson(patch);
      const id = key(patch.language, patch.lessonId);
      const before = overrides.get(id);
      if (createOnly && before) throw new LessonConflict("Lesson progress already exists.");
      const now = Date.now();
      overrides.set(id, { language: patch.language, lessonId: patch.lessonId, level: patch.level ?? before?.level ?? null,
        levelSetAt: patch.level === undefined ? before?.levelSetAt ?? null : now, active: patch.active ?? before?.active ?? true, updatedAt: now });
      const row = (await store.list(patch.language)).find(row => row.lessonId === patch.lessonId);
      if (!row) throw new Error("The saved lesson could not be read.");
      return row;
    },
    async deleteOverride(language, lessonId) { overrides.delete(key(language, lessonId)); },
  };
  return store;
}
