import { describe, expect, it } from "vitest";
import { gradeProgress, PREVIEW_SUBJECTS, SKILL_STATUS_LABEL } from "./preview-data";

describe("preview sample data", () => {
  it("covers Math, English and Science, each from Grade 1 to Grade 2", () => {
    expect(PREVIEW_SUBJECTS.map((s) => s.name)).toEqual(["Math", "English", "Science"]);
    for (const s of PREVIEW_SUBJECTS) {
      expect([s.gradeFrom, s.gradeTo]).toEqual([1, 2]);
      expect(s.skills.some((k) => k.grade === 1)).toBe(true);
      expect(s.skills.some((k) => k.grade === 2)).toBe(true);
    }
  });

  it("never claims mastery or scores", () => {
    const text = JSON.stringify([PREVIEW_SUBJECTS, SKILL_STATUS_LABEL]);
    expect(text).not.toMatch(/master|score|percent|%|failed/i);
  });

  it("dates every sample session before the demo day", () => {
    for (const s of PREVIEW_SUBJECTS.flatMap((x) => x.sessions)) {
      expect(new Date(s.date).getTime()).toBeLessThan(new Date("2026-11-14T00:00:00").getTime());
    }
  });

  it("counts answered Grade 1 math skills", () => {
    expect(gradeProgress(PREVIEW_SUBJECTS[0]!, 1)).toEqual({ answered: 5, total: 5 });
    expect(gradeProgress(PREVIEW_SUBJECTS[0]!, 2)).toEqual({ answered: 0, total: 3 });
  });
});
