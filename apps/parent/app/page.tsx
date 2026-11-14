import { CHILD, SESSIONS, type AnswerStatus } from "./sessions";

const STATUS: Record<AnswerStatus, { label: string; tone: string }> = {
  correct: { label: "Correct", tone: "good" },
  incorrect: { label: "Not yet", tone: "warn" },
  unclear: { label: "Unclear", tone: "muted" },
  off_topic: { label: "Off topic", tone: "muted" },
  not_assessed: { label: "Didn't hear", tone: "muted" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function ParentView() {
  const all = SESSIONS.flatMap((s) => s.interactions);
  const answered = all.filter((i) => i.status === "correct" || i.status === "incorrect");
  const afterHelp = all.filter((i) => i.status === "correct" && i.assistanceBefore);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <p className="eyebrow">Parent view</p>
          <h1>{CHILD}&apos;s learning moments</h1>
        </div>
        <a className="play" href={process.env.NEXT_PUBLIC_PLAY_URL ?? "http://localhost:3000"} target="_blank" rel="noreferrer">
          Open Play mode ↗
        </a>
      </header>

      <section className="stats">
        <div>
          <b>{SESSIONS.length}</b>
          <span>episodes watched</span>
        </div>
        <div>
          <b>{answered.length}</b>
          <span>questions answered</span>
        </div>
        <div>
          <b>{afterHelp.length}</b>
          <span>answered after a hint</span>
        </div>
      </section>

      <section className="sessions">
        {SESSIONS.map((s) => (
          <details key={s.id} className="session" style={{ ["--show" as string]: s.color }} open={s === SESSIONS[0]}>
            <summary>
              <span className="show">{s.show}</span>
              <span className="meta">
                {s.episode} · {when(s.startedAt)}
              </span>
              <p className="summary">{s.parentSummary ?? "No answer was heard in this session."}</p>
            </summary>
            <ol className="turns">
              {s.interactions.map((i) => (
                <li key={i.turn}>
                  <p className="q">
                    <span>Dora asked</span>
                    {i.question}
                  </p>
                  <p className="a">
                    <span>{CHILD} said</span>
                    {i.transcript ? `“${i.transcript}”` : <em>nothing heard</em>}
                    <i className={`chip ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</i>
                    {i.assistanceBefore && <i className="chip muted">after a hint</i>}
                  </p>
                  <p className="r">
                    <span>Dora replied</span>
                    {i.response}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </section>

      <p className="fine">
        Each card shows what happened in one episode. A single answer is a snapshot, not a measure of mastery.
      </p>
    </main>
  );
}
