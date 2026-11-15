import curriculum from "../../app/lab/mastery.json";

// Mastery (learning-plan.md): every lesson practises one skill from app/lab/mastery.json (tools/build-mastery.py).
// Levels come from saved turns, looked up by spotId, so old sessions count too. Thresholds are guesses:
// tune them after watching real kids.
export const GOT_IT_FIRST_TRIES = 2; // right before any help, at least this many times…
export const GOT_IT_SESSIONS = 2; // …across at least this many viewings
export const RUSTY_DAYS = 14;

export type MasteryTurn = {
  sessionId: string;
  spotId: string;
  outcome: string | null; // first_try | after_help | gave | no_answer | error | null
  endedAt: number;
  practiceLanguage: string | null;
  practiceWord: string | null;
  practiceOutcome: string | null; // good | missed
};
export type SkillLevel = "new" | "practising" | "got_it" | "rusty";
export type WordLevel = "heard" | "said" | "remembered";
export type MasteryReset = { skillId: string; resetAt: number };
export type Mastery = {
  categories: Array<{ id: string; name: string; skills: Array<{ id: string; name: string; level: SkillLevel; asked: number; firstTry: number; lastSeen: number | null }> }>;
  languages: Array<{ language: string; words: Array<{ word: string; level: WordLevel; lastSeen: number }> }>;
};

const LESSON_SKILL: Record<string, string> = curriculum.lessons;
const TAUGHT = new Set(Object.values(LESSON_SKILL));
// Only skills some lesson actually practises; the rest would sit at "not yet" forever.
export const CATEGORIES = curriculum.categories
  .map((c) => ({ ...c, skills: c.skills.filter((s) => TAUGHT.has(s.id)) }))
  .filter((c) => c.skills.length > 0);
export const skillOf = (spotId: string): string | null => LESSON_SKILL[spotId] ?? null;

const DONE = new Set(["first_try", "after_help", "gave", "no_answer"]);

export function skillLevel(turns: readonly MasteryTurn[], now: number): SkillLevel {
  const done = turns.filter((t) => t.outcome && DONE.has(t.outcome)).sort((a, b) => a.endedAt - b.endedAt);
  if (done.length === 0) return "new";
  const right = done.filter((t) => t.outcome === "first_try");
  const gotIt = right.length >= GOT_IT_FIRST_TRIES && new Set(right.map((t) => t.sessionId)).size >= GOT_IT_SESSIONS;
  if (!gotIt) return "practising";
  const last = done[done.length - 1]!;
  const lastTwoNeededHelp = done.length >= 2 && done.slice(-2).every((t) => t.outcome !== "first_try");
  return now - last.endedAt > RUSTY_DAYS * 86_400_000 || lastTwoNeededHelp ? "rusty" : "got_it";
}

/** Heard: Dora taught it. Said: the kid said it well. Remembered: said it well in two or more viewings. */
export function wordLevel(turns: readonly MasteryTurn[]): WordLevel {
  const good = new Set(turns.filter((t) => t.practiceOutcome === "good").map((t) => t.sessionId));
  return good.size >= 2 ? "remembered" : good.size === 1 ? "said" : "heard";
}

export function masteryFrom(turns: readonly MasteryTurn[], now = Date.now(), resets: readonly MasteryReset[] = []): Mastery {
  const resetAt = new Map(resets.map(r => [r.skillId, r.resetAt]));
  const bySkill = new Map<string, MasteryTurn[]>();
  const byWord = new Map<string, MasteryTurn[]>(); // "fr\u0000pont"
  for (const t of turns) {
    const skill = skillOf(t.spotId);
    if (skill && t.endedAt <= (resetAt.get(skill) ?? -Infinity)) continue;
    if (skill) bySkill.set(skill, [...(bySkill.get(skill) ?? []), t]);
    if (t.practiceLanguage && t.practiceWord) {
      const k = `${t.practiceLanguage}\u0000${t.practiceWord}`;
      byWord.set(k, [...(byWord.get(k) ?? []), t]);
    }
  }
  const categories = CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    skills: c.skills.map((s) => {
      const ts = (bySkill.get(s.id) ?? []).filter((t) => t.outcome && DONE.has(t.outcome));
      return {
        ...s,
        level: skillLevel(ts, now),
        asked: ts.length,
        firstTry: ts.filter((t) => t.outcome === "first_try").length,
        lastSeen: ts.length ? Math.max(...ts.map((t) => t.endedAt)) : null,
      };
    }),
  }));
  const languages = new Map<string, Mastery["languages"][number]["words"]>();
  for (const [k, ts] of byWord) {
    const [language, word] = k.split("\u0000") as [string, string];
    languages.set(language, [...(languages.get(language) ?? []), { word, level: wordLevel(ts), lastSeen: Math.max(...ts.map((t) => t.endedAt)) }]);
  }
  return {
    categories,
    languages: [...languages].map(([language, words]) => ({ language, words: words.sort((a, b) => b.lastSeen - a.lastSeen) })),
  };
}
