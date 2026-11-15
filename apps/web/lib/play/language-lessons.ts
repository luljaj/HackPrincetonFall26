import { z } from "zod";
import translations from "../../app/lab/translations.json";
import focusTranslations from "../../app/lab/focus-translations.json";
import lessons from "../../app/lab/lessons.json";
import { ADDITION_LESSONS } from "../../app/lab/focus-lessons";

export const LanguageCodeSchema = z.enum(["es", "fr", "de", "zh", "hi", "ja"]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;
export const LANGUAGE_NAMES: Record<LanguageCode, string> = { es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };
export const LessonLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type LessonLevel = z.infer<typeof LessonLevelSchema>;
export const LESSON_LEVELS = ["New", "Heard", "Said", "Remembered"] as const;
const Word = z.object({ word: z.string(), romanized: z.string(), ipa: z.string() });
const translationsById = z.record(z.string(), z.record(z.string(), z.unknown())).parse({ ...translations, ...focusTranslations });
const questions = new Map(Object.entries(lessons).map(([id, lesson]) => [id, lesson.question]));
for (const lesson of ADDITION_LESSONS) questions.set(lesson.id, lesson.question);
export const LessonIdSchema = z.enum(Object.keys(translationsById));
export const LessonKeySchema = z.object({ language: LanguageCodeSchema, lessonId: LessonIdSchema });
export const LessonWriteSchema = LessonKeySchema.extend({ level: LessonLevelSchema.optional(), active: z.boolean().optional() })
  .refine(v => v.level !== undefined || v.active !== undefined, "Choose a level or add/remove the lesson.")
  .refine(v => languageCatalog(v.language).some(l => l.lessonId === v.lessonId), "That lesson is not available in this language.");
export type LessonWrite = z.infer<typeof LessonWriteSchema>;
export type LessonOverride = { language: LanguageCode; lessonId: string; level: LessonLevel | null; levelSetAt: number | null; active: boolean; updatedAt: number };
export type PracticeEvidence = { sessionId: string; spotId: string; endedAt: number; practiceLanguage: string | null; practiceWord: string | null; practiceOutcome: string | null };
export const LanguageLessonSchema = z.object({ lessonId: z.string(), language: LanguageCodeSchema, question: z.string(), english: z.string(), word: z.string(), romanized: z.string(), level: LessonLevelSchema, active: z.boolean(), source: z.enum(["parent", "recorded", "new"]), updatedAt: z.number().nullable() });
export type LanguageLesson = z.infer<typeof LanguageLessonSchema>;
export const LESSONS_EVENT = "parent-language-lessons-changed";


export function languageCatalog(language: LanguageCode) {
  return Object.entries(translationsById).flatMap(([lessonId, translation]) => {
    const word = Word.safeParse(translation[language]);
    return word.success && typeof translation.english === "string" ? [{ lessonId, language, question: questions.get(lessonId) ?? `Say ${translation.english}`, english: translation.english, word: word.data.word, romanized: word.data.romanized }] : [];
  });
}

export function languageLessons(language: LanguageCode, evidence: readonly PracticeEvidence[], overrides: readonly LessonOverride[]): LanguageLesson[] {
  return languageCatalog(language).map(lesson => {
    const override = overrides.find(row => row.lessonId === lesson.lessonId && row.language === language);
    const turns = evidence.filter(t => t.practiceLanguage === language && t.spotId === lesson.lessonId && t.practiceWord && (override?.levelSetAt == null || t.endedAt > override.levelSetAt));
    const goodSessions = new Set(turns.filter(t => t.practiceOutcome === "good").map(t => t.sessionId)).size;
    const recorded: LessonLevel = goodSessions >= 2 ? 3 : goodSessions === 1 ? 2 : turns.length ? 1 : 0;
    const level = LessonLevelSchema.parse(Math.max(override?.level ?? 0, recorded));
    return { ...lesson, level, active: override?.active ?? true, source: override?.level != null ? "parent" : turns.length ? "recorded" : "new", updatedAt: override?.updatedAt ?? (turns.length ? Math.max(...turns.map(t => t.endedAt)) : null) };
  });
}
