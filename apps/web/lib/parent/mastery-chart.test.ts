import { expect, it } from "vitest";
import type { Mastery, SkillLevel } from "../play/mastery";
import { categoryProgress } from "./mastery-chart";

const category = (...levels: SkillLevel[]): Mastery["categories"][number] => ({
  id: "numbers", name: "Numbers", skills: levels.map((level, i) => ({ id: String(i), name: String(i), level, asked: 0, firstTry: 0, lastSeen: null })),
});
it("uses saved skill levels for the petal fill, including zero and empty categories", () => {
  expect(categoryProgress(category("new", "new", "practising", "rusty"))).toEqual({ gotIt: 0, total: 4, fraction: .1875 });
  expect(categoryProgress(category("got_it", "new", "practising", "rusty"))).toEqual({ gotIt: 1, total: 4, fraction: .4375 });
  expect(categoryProgress(category("new", "new"))).toEqual({ gotIt: 0, total: 2, fraction: 0 });
  expect(categoryProgress(category("got_it", "got_it"))).toEqual({ gotIt: 2, total: 2, fraction: 1 });
  expect(categoryProgress(category())).toEqual({ gotIt: 0, total: 0, fraction: 0 });
});
