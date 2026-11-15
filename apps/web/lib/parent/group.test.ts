import { describe, expect, it } from "vitest";
import { sampleView } from "./fixtures";
import { groupByShow } from "./group";
import { DEFAULT_FOCUS, FocusSchema, focusSummary } from "./preferences";
import type { ParentView } from "./types";

const at = (startedAt: string, sceneId = "demo-scene"): ParentView => ({ ...sampleView, sceneId, startedAt });

describe("groupByShow", () => {
  it("puts sessions of the same show together, newest first", () => {
    const groups = groupByShow([
      at("2026-11-14T10:00:00Z"),
      at("2026-11-14T12:00:00Z"),
      at("2026-11-13T09:00:00Z", "unknown-scene"),
    ]);
    expect(groups.map((g) => g.show)).toEqual(["Dora", "Episode"]);
    expect(groups[0]!.sessions.map((s) => s.startedAt)).toEqual([
      "2026-11-14T12:00:00Z",
      "2026-11-14T10:00:00Z",
    ]);
    expect(groups[0]!.answered).toBe(4); // the sample has 2 answered questions per session
  });

  it("returns nothing for no sessions", () => {
    expect(groupByShow([])).toEqual([]);
  });
});

describe("learning focus", () => {
  it("summarises the focus in one sentence", () => {
    expect(focusSummary(DEFAULT_FOCUS)).toBe("A balanced mix of subjects.");
    expect(focusSummary({ ...DEFAULT_FOCUS, words: "more", shapes: "less" })).toBe("More Words, less Shapes.");
  });

  it("rejects unknown subjects and levels", () => {
    expect(FocusSchema.safeParse({ ...DEFAULT_FOCUS, art: "more" }).success).toBe(false);
    expect(FocusSchema.safeParse({ ...DEFAULT_FOCUS, math: "lots" }).success).toBe(false);
  });
});
