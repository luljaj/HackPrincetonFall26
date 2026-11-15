import type { Mastery } from "../play/mastery";

export function categoryProgress(category: Mastery["categories"][number]) {
  const total = category.skills.length;
  const gotIt = category.skills.filter(skill => skill.level === "got_it").length;
  const progress = category.skills.reduce((sum, skill) => sum + (skill.level === "got_it" ? 1 : skill.level === "rusty" ? .5 : skill.level === "practising" ? Math.min(.75, .25 + .25 * skill.firstTry) : 0), 0);
  return { gotIt, total, fraction: total ? progress / total : 0 };
}
