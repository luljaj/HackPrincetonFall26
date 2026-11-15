import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { HighlightTone } from "../../../lib/parent/highlight";
import type { ProgressInteraction } from "../../../lib/parent/types";
import { AFTER_HELP_CHIP, statusChip } from "../../../lib/parent/wording";
import { Chip } from "./chip";
import { AssessmentLabel } from "./assessment-label";
import { MisconceptionNote } from "./misconception-note";

// Amber is used for one thing only: an incorrect answer that has just arrived.
const highlightClasses: Record<HighlightTone, string> = {
  incorrect: "border-attention ring-2 ring-attention/60",
  neutral: "border-primary ring-2 ring-primary",
};

export function InteractionCard({
  interaction,
  highlight = null,
  childName = "Child",
}: {
  interaction: ProgressInteraction;
  childName?: string;
  /** Set for a few seconds when this answer just arrived; null otherwise. */
  highlight?: HighlightTone | null;
}) {
  const chip = statusChip(interaction.assessment.answerStatus);
  return (
    <Card
      id={`answer-${interaction.interactionId}`}
      data-new={highlight ? "true" : undefined}
      data-tone={highlight ?? undefined}
      className={cn(
        "gap-2 px-5 py-4 transition-[box-shadow,border-color] duration-700",
        highlight && highlightClasses[highlight],
      )}
    >
      <CardHeader className="gap-1 px-0">
        <CardDescription className="flex items-center justify-between gap-2 text-xs">
          <span>Turn {interaction.turnNumber} · Dora asked</span>
          {highlight && (
            <Badge className={cn(highlight === "incorrect" && "bg-attention text-background")}>New answer</Badge>
          )}
        </CardDescription>
        <CardTitle className="font-lexend text-sm leading-[1.35] font-medium">
          {interaction.questionText}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{childName} said</span>
          <span className="font-display text-base font-bold">
            {interaction.transcript ? `“${interaction.transcript}”` : "Nothing heard"}
          </span>
          <Chip tone={chip.tone}>{chip.label}</Chip>
          {interaction.assessment.assistanceBeforeAnswer && <Chip tone="muted">{AFTER_HELP_CHIP}</Chip>}
        </p>
        <AssessmentLabel assessment={interaction.assessment} />
        <MisconceptionNote misconception={interaction.assessment.possibleMisconception} />
      </CardContent>
      <CardFooter className="px-0 text-xs text-muted-foreground">
        Dora replied: {interaction.responseText}
      </CardFooter>
    </Card>
  );
}
