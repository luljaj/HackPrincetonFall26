import curriculum from "../../app/lab/mastery.json";
import type { Mastery } from "../play/mastery";

// Provisional bands for the prepared Dora scene: these describe the curriculum, not a child's grade.
const BAND: Record<string, string> = {
  "count-to-5": "Pre-K", "count-to-10": "Kindergarten", "how-many": "Kindergarten", "add-small-numbers": "Grade 1",
  "name-shapes": "Pre-K", "match-shapes": "Kindergarten", "recall-objects": "Pre-K", "recall-events": "Kindergarten", "recall-places": "Grade 1",
  "pick-object": "Pre-K", "pick-place": "Kindergarten", "explain-choice": "Grade 1", "name-things": "Pre-K", "action-words": "Kindergarten", "describe-things": "Grade 1",
  "imagine": "Pre-K", "what-next": "Kindergarten", "feelings": "Grade 1", "answer-aloud": "Pre-K", "chant": "Kindergarten", "do-action": "Kindergarten", "spanish-words": "Pre-K",
};
const ORDER: Record<string, string[]> = { choosing: ["pick-object", "pick-place", "explain-choice"], remembering: ["recall-objects", "recall-events", "recall-places"], stories: ["imagine", "what-next", "feelings"] };
const NEXT: Record<string, { name: string; band: string }> = {
  numbers: { name: "Add and subtract within 10", band: "Grade 1" }, shapes: { name: "Build and compare shapes", band: "Grade 1" },
  remembering: { name: "Retell three events in order", band: "Grade 1" }, choosing: { name: "Compare two possible solutions", band: "Grade 1" },
  words: { name: "Use a new word in a sentence", band: "Grade 1" }, stories: { name: "Explain a character's choice", band: "Grade 1" },
  "joining-in": { name: "Lead a short activity", band: "Grade 1" }, "show-spanish": { name: "Use a short Spanish phrase", band: "Kindergarten" },
};
export function subjectRoadmaps(mastery: Mastery) {
  return curriculum.categories.map(category => {
    const ordering = ORDER[category.id];
    const skills = [...category.skills].sort((a,b) => ordering ? ordering.indexOf(a.id) - ordering.indexOf(b.id) : 0);
    const progress = mastery.categories.find(c => c.id === category.id);
    let previousComplete = true;
    const nodes = skills.map((skill, i) => {
      const saved = progress?.skills.find(s => s.id === skill.id);
      const lessonIds = Object.entries(curriculum.lessons).filter(([, id]) => id === skill.id).map(([id]) => id);
      const complete = saved?.level === "got_it";
      const locked = !previousComplete && !complete && !saved?.asked;
      previousComplete = previousComplete && complete;
      return { ...skill, band: BAND[skill.id] ?? "Kindergarten", checkpoint: i * 10, state: complete ? "complete" as const : !lessonIds.length ? "planned" as const : locked ? "locked" as const : "current" as const,
        asked: saved?.asked ?? 0, firstTry: saved?.firstTry ?? 0, lessonIds };
    });
    const next = NEXT[category.id];
    return { id: category.id, name: category.name, nodes: [...nodes, ...(next ? [{ id: `${category.id}-next`, name: next.name, band: next.band, checkpoint: nodes.length * 10, state: "planned" as const, asked: 0, firstTry: 0, lessonIds: [] }] : [])] };
  });
}
