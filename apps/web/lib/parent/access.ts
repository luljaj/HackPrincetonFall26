import { cookies } from "next/headers";

// Simple demo gate (learning-progress-plan.md §8.6). Not an account system.
// If PARENT_ACCESS_CODE is unset, the dashboard is open — fine locally, never for a public deploy.
export const ACCESS_COOKIE = "parent_access";

export function accessCodeRequired(): boolean {
  return Boolean(process.env.PARENT_ACCESS_CODE);
}

export async function hasParentAccess(): Promise<boolean> {
  const code = process.env.PARENT_ACCESS_CODE;
  if (!code) return true;
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value === code;
}
