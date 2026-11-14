// Which answers just arrived (learning-progress-plan.md §8: make the judge's wrong answer land).
// Pure, so it can be unit tested without a browser.

export const HIGHLIGHT_MS = 8000;

export type HighlightTone = "incorrect" | "neutral";

/**
 * `seen` is null on the first render: everything already on screen counts as seen, so a page
 * load or refresh never flashes. After that, any interaction ID not seen before is fresh.
 */
export function findFreshIds(
  seen: ReadonlySet<string> | null,
  ids: readonly string[],
): { seen: Set<string>; fresh: string[] } {
  const next = new Set(seen ?? []);
  const fresh: string[] = [];
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      if (seen !== null) fresh.push(id);
    }
  }
  return { seen: next, fresh };
}

/** Wrong answers get the strong highlight; every other new answer gets a quiet one. */
export function highlightTone(answerStatus: string): HighlightTone {
  return answerStatus === "incorrect" ? "incorrect" : "neutral";
}
