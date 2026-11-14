import type { SessionProgress } from "../../../lib/parent/types";
import { AssessmentLabel } from "./assessment-label";
import { MisconceptionNote } from "./misconception-note";

type Interaction = SessionProgress["interactions"][number];

export function InteractionCard({ interaction }: { interaction: Interaction }) {
  return (
    <article className="space-y-2 rounded border border-foreground/15 p-4">
      <p className="text-xs text-foreground/60">Turn {interaction.turnNumber}</p>
      <p>
        <span className="text-foreground/60">Dora asked: </span>
        {interaction.questionText}
      </p>
      <p>
        <span className="text-foreground/60">Child said: </span>“{interaction.transcript}”
      </p>
      <AssessmentLabel assessment={interaction.assessment} />
      <MisconceptionNote misconception={interaction.assessment.possibleMisconception} />
      <p className="text-sm text-foreground/70">
        <span className="text-foreground/60">Dora replied: </span>
        {interaction.responseText}
      </p>
    </article>
  );
}
