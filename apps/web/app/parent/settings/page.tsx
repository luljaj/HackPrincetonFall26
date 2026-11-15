import Link from "next/link";
import { childName } from "../../../lib/parent/child";
import { showFor } from "../../../lib/parent/shows";
import { summarize } from "../../../lib/play/view";
import { getPlayStore, TRANSCRIPT_DAYS } from "../../../server/storage";
import { DeleteTrace } from "./delete-trace";
import { DemoModeToggle } from "./demo-mode-toggle";

export const dynamic = "force-dynamic";

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Settings → saved viewings. Every Play-mode trace, with a delete for each one and for all of them.
export default async function SettingsPage() {
  const name = childName();
  const records = await getPlayStore().list(200);

  return (
    <>
      <header className="space-y-3">
        <h1 className="text-[34px] tracking-tight">Settings</h1>
        <p className="max-w-[520px] text-[15px] leading-snug text-foreground/60">
          Every time {name} watches, the app saves a trace: each pause, what {name} said, and how Dora helped. What{" "}
          {name} said is kept for {TRANSCRIPT_DAYS} days, then removed. You can delete any trace here.
        </p>
      </header>

      <DemoModeToggle child={name} />

      <section className="space-y-4 rounded-[32px] bg-[#f9f9fb] p-6" aria-labelledby="traces-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="traces-title" className="text-[19px] tracking-tight">
            Saved viewings ({records.length})
          </h2>
          {records.length > 0 && <DeleteTrace label="Delete all" />}
        </div>
        {records.length === 0 && <p className="text-sm text-foreground/60">No viewings saved.</p>}
        <ul className="grid gap-2">
          {records.map(({ session, turns }) => {
            const show = showFor(session.episodeId);
            return (
              <li key={session.sessionId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b className="font-semibold" style={{ color: show.color }}>
                      {show.show}
                    </b>{" "}
                    <span className="text-foreground/60">
                      {show.episode} · {when(session.startedAt)} · {turns.length} pause{turns.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-foreground/50">{summarize(turns) ?? "No pause reached yet."}</p>
                </div>
                {turns.length > 0 && (
                  <Link className="text-xs underline" href={`/parent/${session.sessionId}`}>
                    View
                  </Link>
                )}
                <DeleteTrace sessionId={session.sessionId} label="Delete" />
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
