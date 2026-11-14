import { describe, expect, it } from "vitest";
import { findFreshIds, highlightTone } from "./highlight";

describe("findFreshIds", () => {
  it("never highlights what is already on screen at first load", () => {
    const { seen, fresh } = findFreshIds(null, ["a", "b"]);
    expect(fresh).toEqual([]);
    expect([...seen]).toEqual(["a", "b"]);
  });

  it("highlights only answers that arrive later", () => {
    const first = findFreshIds(null, ["a"]);
    const second = findFreshIds(first.seen, ["a", "b"]);
    expect(second.fresh).toEqual(["b"]);
    expect(findFreshIds(second.seen, ["a", "b"]).fresh).toEqual([]);
  });

  it("treats an empty first load as seen, so the first live answer still highlights", () => {
    const empty = findFreshIds(null, []);
    expect(findFreshIds(empty.seen, ["a"]).fresh).toEqual(["a"]);
  });
});

describe("highlightTone", () => {
  it("uses the strong tone only for incorrect answers", () => {
    expect(highlightTone("incorrect")).toBe("incorrect");
    for (const s of ["correct", "unclear", "off_topic", "not_assessed"]) {
      expect(highlightTone(s)).toBe("neutral");
    }
  });
});
