import { cookies } from "next/headers";

export const CHILD_NAME_COOKIE = "parent_child_name";

// A browser-specific nickname; the environment variable remains the default.
export async function childName(): Promise<string> {
  const saved = (await cookies()).get(CHILD_NAME_COOKIE)?.value.trim();
  return saved || process.env.PARENT_CHILD_NAME?.trim() || "Sam";
}
