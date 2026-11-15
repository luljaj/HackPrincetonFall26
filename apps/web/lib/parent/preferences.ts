import { z } from "zod";

// Parent learning focus: per subject, less / usual / more. Changeable at any time from /parent.
// Saved today; the kid side (Play mode) can read it from GET /api/parent/preferences to pick
// more moments in a subject. Nothing in the pipeline depends on it.

export const SUBJECTS = [
  { id: "math", name: "Math", color: "#2f9e5b" },
  { id: "english", name: "English", color: "#7b61ff" },
  { id: "science", name: "Science", color: "#e08a00" },
] as const;

export type SubjectId = (typeof SUBJECTS)[number]["id"];
export const FOCUS_LEVELS = ["less", "usual", "more"] as const;
export type FocusLevel = (typeof FOCUS_LEVELS)[number];

export const FOCUS_LABEL: Record<FocusLevel, string> = { less: "Less", usual: "Usual", more: "More" };

const Level = z.enum(FOCUS_LEVELS);
export const FocusSchema = z.strictObject({ math: Level, english: Level, science: Level });
export type Focus = z.infer<typeof FocusSchema>;

export const DEFAULT_FOCUS: Focus = { math: "usual", english: "usual", science: "usual" };

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
