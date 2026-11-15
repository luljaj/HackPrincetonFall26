import { showFor } from "./shows";
import type { ParentView } from "./types";

export type ShowGroup = {
  show: string;
  color: string;
  sessions: ParentView[]; // newest first
  answered: number; // correct + incorrect answers across these sessions
};

/** Groups sessions by show for the compact parent home. Shows with the newest session come first. */
export function groupByShow(views: readonly ParentView[]): ShowGroup[] {
  const groups = new Map<string, ShowGroup>();
  const newestFirst = [...views].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const v of newestFirst) {
    const info = showFor(v.sceneId);
    const group = groups.get(info.show) ?? { show: info.show, color: info.color, sessions: [], answered: 0 };
    group.sessions.push(v);
    group.answered += v.progress.interactions.filter(
      (i) => i.assessment.answerStatus === "correct" || i.assessment.answerStatus === "incorrect",
    ).length;
    groups.set(info.show, group);
  }
  return [...groups.values()];
}
