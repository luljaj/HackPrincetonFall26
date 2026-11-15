import { z } from "zod";

import { CATEGORIES } from "../play/mastery";

// Parent learning focus: less / usual / more per mastery category (app/lab/mastery.json). Changeable at any
// time from /parent; saved in Postgres and mirrored to the live learning plan (lib/live/plan.ts).

const COLORS = ["#2f9e5b", "#e08a00", "#7b61ff", "#d6336c", "#1c7ed6", "#0ca678", "#f76707", "#ae3ec9"];
export const SUBJECTS = CATEGORIES.map((c, i) => ({ id: c.id, name: c.name, color: COLORS[i % COLORS.length]! }));

export type SubjectId = string;
export const FOCUS_LEVELS = ["less", "usual", "more"] as const;
export const PLAN_LANGUAGES = ["", "es", "fr", "de", "zh", "hi", "ja"] as const;
export type FocusLevel = (typeof FOCUS_LEVELS)[number];

export const FOCUS_LABEL: Record<FocusLevel, string> = { less: "Less", usual: "Usual", more: "More" };

const Level = z.enum(FOCUS_LEVELS);
const ids = SUBJECTS.map((x) => x.id) as [string, ...string[]];
export const FocusSchema = z.record(z.enum(ids), Level); // every category, nothing else
export type Focus = Record<SubjectId, FocusLevel>;

export const DEFAULT_FOCUS: Focus = Object.fromEntries(ids.map((id) => [id, "usual"]));

export type ParentPreferences = { focus: Focus; updatedAt: string | null };

/** One line for the parent: which subjects get more or less. */
export function focusSummary(focus: Focus): string {
  const more = SUBJECTS.filter((s) => focus[s.id] === "more").map((s) => s.name);
  const less = SUBJECTS.filter((s) => focus[s.id] === "less").map((s) => s.name);
  if (more.length === 0 && less.length === 0) return "A balanced mix of subjects.";
  const parts = [];
  if (more.length) parts.push(`More ${more.join(" and ")}`);
  if (less.length) parts.push(`less ${less.join(" and ")}`);
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Fired on window when the focus changes, so the companion and the Learning focus card stay in step. */
export const FOCUS_EVENT = "parent-focus-changed";
export type FocusEventDetail = { focus: Focus; from: "companion" | "card" };
