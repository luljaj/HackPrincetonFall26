import { assistanceCountWording, statusLabel } from "../../../lib/parent/wording";
import type { SessionProgress } from "../../../lib/parent/types";

export function ParentSummary({ episode }: { episode: SessionProgress["episode"] }) {
  return (
    <section className="space-y-1 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm text-foreground/60">Summary</h2>
      {episode.parentSummary && <p className="text-lg">{episode.parentSummary}</p>}
      <p className="text-sm text-foreground/70">
        Latest answer: {statusLabel(episode.finalStatus)} ·{" "}
        {assistanceCountWording(episode.responsesWithAssistance)}
      </p>
    </section>
  );
}
