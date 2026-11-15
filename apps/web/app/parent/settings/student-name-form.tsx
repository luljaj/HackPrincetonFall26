"use client";

import { useActionState } from "react";
import { saveStudentName } from "./student-name-action";

export function StudentNameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveStudentName, { error: "", saved: false });

  return (
    <section className="space-y-3 rounded-[32px] bg-[#f9f9fb] p-6" aria-labelledby="student-name-title">
      <h2 id="student-name-title" className="text-[19px] tracking-tight">Student name</h2>
      <p id="student-name-help" className="text-sm text-foreground/60">
        Use a first name or nickname. Saved in this browser for the parent dashboard and chat.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="student-name" className="block text-sm">Name</label>
          <input
            id="student-name"
            name="name"
            defaultValue={name}
            required
            maxLength={40}
            aria-describedby="student-name-help student-name-status"
            aria-invalid={Boolean(state.error)}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
          />
        </div>
        <button type="submit" disabled={pending} className="rounded-xl bg-[#3949f4] px-5 py-3 text-sm text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save name"}
        </button>
        <p id="student-name-status" role="status" className="w-full text-sm text-foreground/60">
          {state.error || (state.saved ? "Name saved." : "")}
        </p>
      </form>
    </section>
  );
}
