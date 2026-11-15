// Skill (from lessons.json) → parent-facing topic and subject. Subjects match the Learning focus
// controls (lib/parent/preferences.ts); "language" has no focus control yet.
const SKILLS: Record<string, { topic: string; subject: string }> = {
  counting: { topic: "Numbers", subject: "math" },
  shapes: { topic: "Shapes", subject: "math" },
  words: { topic: "Words", subject: "english" },
  story: { topic: "Stories", subject: "english" },
  imagination: { topic: "Imagination", subject: "english" },
  objects: { topic: "Objects", subject: "science" },
  places: { topic: "Places", subject: "science" },
  feelings: { topic: "Feelings", subject: "english" },
  spanish: { topic: "Language", subject: "language" },
};

export function skillInfo(skill: string | undefined): { topic: string; subject: string } {
  return SKILLS[skill ?? ""] ?? { topic: "Other", subject: "other" };
}
