import edit from "./demo-edit.json" with { type: "json" };

// The demo (?demo): the real episode, uncut. Only these moments pause, and Skip jumps over the parts
// without an exercise. See demo-edit.json.
export const DEMO_EDIT = edit;
export const DEMO_PAUSE_IDS: readonly string[] = edit.exercises.map((x) => x.pauseId);

/** Where a demo moment holds: its `holdAt` if the show's own pause frame hides the thing to find. */
export const demoPauseAt = (id: string, showPauseAt: number): number =>
  (edit.exercises.find((x) => x.pauseId === id) as { holdAt?: number } | undefined)?.holdAt ?? showPauseAt;

// Where Skip goes from `time`: the next exercise's setup (a shot change before its question), then the
// finale. null = nothing left to skip to.
export function skipTarget(time: number, pauseAt: (id: string) => number): { from: number; label: string } | null {
  const i = edit.exercises.findIndex((x) => pauseAt(x.pauseId) > time + 0.5);
  const next = edit.exercises[i];
  if (next) return { from: Math.max(next.from, time), label: `${i + 1}/${edit.exercises.length} · ${next.label}` };
  return time < edit.finale.from - 0.5 ? edit.finale : null;
}
