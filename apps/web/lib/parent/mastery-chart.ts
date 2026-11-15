import type { Mastery } from "../play/mastery";

export function categoryProgress(category: Mastery["categories"][number]) {
  const total = category.skills.length;
  const gotIt = category.skills.filter(skill => skill.level === "got_it").length;
  return { gotIt, total, fraction: total ? gotIt / total : 0 };
}
