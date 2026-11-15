import { describe, expect, it } from "vitest";
import { TOPIC_LEVEL, TOPICS, topicById, topicTotals } from "./topics-data";

describe("sample topics", () => {
  it("has Shapes, Numbers and Objects", () => {
    expect(TOPICS.map((t) => t.id).sort()).toEqual(["numbers", "objects", "shapes"]);
    expect(topicById("shapes")?.name).toBe("Shapes");
    expect(topicById("art")).toBeUndefined();
  });

  it("ties every learned item and missed question to the video it came from", () => {
    for (const t of TOPICS) {
      for (const x of [...t.learned, ...t.missed]) {
        expect(x.video.show && x.video.episode && x.video.moment).toBeTruthy();
      }
      expect(t.plan.outcomes.length).toBeGreaterThan(0);
      expect(t.plan.nextUp.length).toBeGreaterThan(0);
    }
  });

  it("keeps counts consistent: first try + after help never exceeds questions asked", () => {
    for (const t of TOPICS) expect(t.firstTry + t.afterHelp).toBeLessThanOrEqual(t.questionsAsked);
    const totals = topicTotals();
    expect(totals.asked).toBe(30);
    expect(totals.missed).toBe(6);
  });

  it("never claims mastery or a score", () => {
    expect(JSON.stringify([TOPICS, TOPIC_LEVEL])).not.toMatch(/master|score|percent|%|failed/i);
  });
});
