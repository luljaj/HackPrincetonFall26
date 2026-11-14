import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "../../../lib/parent/access";

async function submitCode(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/parent");
}

export function AccessForm() {
  return (
    <form action={submitCode} className="max-w-xs space-y-3">
      <label htmlFor="code" className="block text-sm">
        Parent access code
      </label>
      <input
        id="code"
        name="code"
        type="password"
        required
        className="w-full rounded border border-foreground/30 bg-transparent px-3 py-2"
      />
      <button type="submit" className="rounded border border-foreground/30 px-4 py-2">
        Open dashboard
      </button>
    </form>
  );
}
