import type { HighlightTone } from "../../../lib/parent/highlight";
import type { ProgressInteraction } from "../../../lib/parent/types";
import { AssessmentLabel } from "./assessment-label";
import { MisconceptionNote } from "./misconception-note";

const highlightClasses: Record<HighlightTone, string> = {
  incorrect: "border-attention ring-2 ring-attention/60",
  neutral: "border-foreground/40 ring-1 ring-foreground/30",
};

export function InteractionCard({
  interaction,
  highlight = null,
}: {
  interaction: ProgressInteraction;
  /** Set for a few seconds when this answer just arrived; null otherwise. */
  highlight?: HighlightTone | null;
}) {
  return (
    <article
      id={`answer-${interaction.interactionId}`}
      data-new={highlight ? "true" : undefined}
      data-tone={highlight ?? undefined}
      className={`space-y-2 rounded border p-4 transition-[box-shadow,border-color] duration-700 ${
        highlight ? highlightClasses[highlight] : "border-foreground/15"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-foreground/60">Turn {interaction.turnNumber}</p>
        {highlight && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              highlight === "incorrect"
                ? "bg-attention text-background"
                : "bg-foreground/10 text-foreground"
            }`}
          >
            New answer
          </span>
        )}
      </div>
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
