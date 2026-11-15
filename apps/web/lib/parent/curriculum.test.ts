import { expect, it } from "vitest";
import { masteryFrom } from "../play/mastery";
import { subjectRoadmaps } from "./curriculum";
it("uses authored lessons, keeps later checkpoints locked, and never invents mastered grades", () => {
  const roads = subjectRoadmaps(masteryFrom([]));
  const math = roads.find(s => s.id === "numbers")!;
  expect(math.nodes[0]).toMatchObject({ state: "current", band: "Pre-K", checkpoint: 0 });
  expect(math.nodes[1]).toMatchObject({ state: "locked", checkpoint: 10 });
  expect(math.nodes.at(-1)).toMatchObject({ state: "planned", lessonIds: [] });
  expect(math.nodes.every(n => n.state !== "complete")).toBe(true);
  const learned = masteryFrom(["a","b"].map(sessionId => ({ sessionId, spotId: "ep3-54", outcome: "first_try", endedAt: Date.now(), practiceLanguage: null, practiceWord: null, practiceOutcome: null })));
  const advanced = subjectRoadmaps(learned).find(s => s.id === "numbers")!;
  expect(advanced.nodes[0]).toMatchObject({ state: "complete", firstTry: 2 });
  expect(advanced.nodes[1]).toMatchObject({ state: "current" });
  expect(advanced.nodes[2]).toMatchObject({ state: "locked" });
  for (const road of subjectRoadmaps(learned)) for (const node of road.nodes) {
    if (node.state === "complete") expect(node.firstTry).toBeGreaterThanOrEqual(2);
  }
});
