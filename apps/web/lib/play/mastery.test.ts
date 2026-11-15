import { describe, expect, it } from "vitest";
import { masteryFrom, skillLevel, skillOf, wordLevel, type MasteryTurn } from "./mastery";

const DAY = 86_400_000;
const now = 100 * DAY;
const turn = (o: Partial<MasteryTurn>): MasteryTurn => ({
  sessionId: "a", spotId: "ep3-39", outcome: "first_try", endedAt: now - DAY,
  practiceLanguage: null, practiceWord: null, practiceOutcome: null, ...o,
});

describe("mastery", () => {
  it("levels a skill: new → practising → got it → rusty", () => {
    expect(skillLevel([], now)).toBe("new");
    expect(skillLevel([turn({}), turn({})], now)).toBe("practising"); // two right, but one viewing
    expect(skillLevel([turn({}), turn({ sessionId: "b" })], now)).toBe("got_it");
    expect(skillLevel([turn({ endedAt: now - 20 * DAY }), turn({ sessionId: "b", endedAt: now - 15 * DAY })], now)).toBe("rusty");
    const slipping = [turn({}), turn({ sessionId: "b" }), turn({ sessionId: "c", outcome: "gave" }), turn({ sessionId: "c", outcome: "after_help", endedAt: now - 1 })];
    expect(skillLevel(slipping, now)).toBe("rusty");
  });

  it("levels a language word: heard → said → remembered", () => {
    const w = (sessionId: string, practiceOutcome: string) => turn({ sessionId, practiceLanguage: "fr", practiceWord: "pont", practiceOutcome });
    expect(wordLevel([w("a", "missed")])).toBe("heard");
    expect(wordLevel([w("a", "good"), w("a", "good")])).toBe("said");
    expect(wordLevel([w("a", "good"), w("b", "good")])).toBe("remembered");
  });

  it("groups turns into categories by lesson, and words by language", () => {
    expect(skillOf("ep3-39")).toBe("match-shapes");
    const m = masteryFrom([turn({}), turn({ sessionId: "b" }), turn({ spotId: "ep3-27", practiceLanguage: "fr", practiceWord: "pont", practiceOutcome: "good" })], now);
    const shapes = m.categories.find((c) => c.id === "shapes")!;
    expect(shapes.skills.find((s) => s.id === "match-shapes")).toMatchObject({ level: "got_it", asked: 2, firstTry: 2 });
    expect(m.languages).toEqual([{ language: "fr", words: [{ word: "pont", level: "said", lastSeen: now - DAY }] }]);
  });
});
