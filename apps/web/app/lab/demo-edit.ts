import edit from "./demo-edit.json" with { type: "json" };

export type DemoExercise = "count" | "addition" | "translation";
export type ExerciseRequest = { exercise: DemoExercise | "story"; sequence: number };
export const nextDemoExercise = (seen: readonly DemoExercise[]): DemoExercise | "story" =>
  (["count", "addition", "translation"] as const).find(exercise => !seen.includes(exercise)) ?? "story";
export const TREASURE_EDIT = edit;
export const DEMO_FILM_SECONDS = edit.clips.reduce((sum, clip) => sum + clip.out-clip.in, 0);

// Keep the original source clock: scene loops, dubs and saved questions retain their exact timestamps.
export function demoPlaybackAt(time: number): { kind: "play" } | { kind: "seek"; time: number } | { kind: "done" } {
  for (const clip of edit.clips) {
    if (time < clip.in - .08) return { kind: "seek", time: clip.in };
    if (time < clip.out - .025) return { kind: "play" };
  }
  return { kind: "done" };
}
export function demoWatchedSeconds(sourceTime: number) {
  return edit.clips.reduce((sum, clip) => sum + Math.max(0,Math.min(sourceTime,clip.out)-clip.in),0);
}
