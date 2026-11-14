import { describe, expect, it } from "vitest";
import { sampleView } from "./fixtures";
import { parentStats } from "./stats";
import { statusChip } from "./wording";

describe("parentStats", () => {
  it("counts sessions, answered questions and correct-after-help", () => {
    // Sample: one incorrect, then one correct after help.
    expect(parentStats([sampleView])).toEqual({ sessions: 1, answered: 2, correctAfterHelp: 1 });
  });

  it("ignores sample sessions once a real session exists", () => {
    const real = { ...sampleView, isSample: false, progress: { ...sampleView.progress, interactions: [] } };
    expect(parentStats([real, sampleView])).toEqual({ sessions: 1, answered: 0, correctAfterHelp: 0 });
  });
});

describe("statusChip", () => {
  it("never labels a wrong answer as failure or mastery", () => {
    for (const s of ["correct", "incorrect", "unclear", "off_topic", "not_assessed"] as const) {
      expect(statusChip(s).label).not.toMatch(/fail|wrong|master|bad/i);
    }
    expect(statusChip("incorrect")).toEqual({ label: "Not yet", tone: "warn" });
  });
});
