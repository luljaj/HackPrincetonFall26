import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ACCESS_COOKIE } from "../../../lib/parent/access";
import { PANEL } from "./panel";

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
    <form action={submitCode} className={`${PANEL} mt-6 flex w-full max-w-[427px] flex-col gap-5`}>
      <h1 className="font-display text-2xl font-bold">Parent access</h1>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="code">Parent access code</FieldLabel>
          <Input id="code" name="code" type="password" required />
        </Field>
      </FieldGroup>
      <Button type="submit" className="self-start px-[34px]">
        Open dashboard
      </Button>
    </form>
  );
}
