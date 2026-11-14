// The child's display name on the parent view. A first name or nickname only (pseudonymous).
// Set PARENT_CHILD_NAME in .env.local to change it; server-side only.
export function childName(): string {
  return process.env.PARENT_CHILD_NAME?.trim() || "Sam";
}
