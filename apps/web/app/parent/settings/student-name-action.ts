"use server";

import { cookies } from "next/headers";
import { hasParentAccess } from "../../../lib/parent/access";
import { CHILD_NAME_COOKIE } from "../../../lib/parent/child";

export async function saveStudentName(_previous: { error: string; saved: boolean }, data: FormData) {
  if (!(await hasParentAccess())) {
    return { error: "Enter the parent access code before changing the name.", saved: false };
  }
  const value = data.get("name");
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 40) {
    return { error: "Enter a name between 1 and 40 characters.", saved: false };
  }
  (await cookies()).set(CHILD_NAME_COOKIE, name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { error: "", saved: true };
}
