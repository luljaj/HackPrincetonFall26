import type { ParentView } from "../../../lib/parent/types";
import { AFTER_HELP_CHIP, statusChip } from "../../../lib/parent/wording";
import { Chip } from "./chip";

// The "Dora asked / Sam said / Dora replied" rows of one session, from the parent mock.
export function TurnRows({ view, childName }: { view: ParentView; childName: string }) {
  return (
    <ol className="grid gap-3">
      {view.progress.interactions.map((i) => {
        const chip = statusChip(i.assessment.answerStatus);
        return (
          <li key={i.interactionId} className="grid gap-1 border-t border-line pt-3 text-sm">
            <p className="grid grid-cols-[96px_1fr]">
              <span className="text-xs text-foreground/60">Dora asked</span>
              {i.questionText}
            </p>
            <p className="grid grid-cols-[96px_1fr]">
              <span className="text-xs text-foreground/60">{childName} said</span>
              <span>
                {i.transcript ? `“${i.transcript}”` : <em className="text-foreground/60">nothing heard</em>}
                <Chip tone={chip.tone}>{chip.label}</Chip>
                {i.assessment.assistanceBeforeAnswer && <Chip tone="muted">{AFTER_HELP_CHIP}</Chip>}
              </span>
            </p>
            <p className="grid grid-cols-[96px_1fr]">
              <span className="text-xs text-foreground/60">Dora replied</span>
              {i.responseText}
            </p>
            {i.assessment.evidence && <p className="pl-[96px] text-xs text-foreground/50">{i.assessment.evidence}</p>}
          </li>
        );
      })}
      {view.progress.activeQuestion && (
        <li className="border-t border-line pt-3 text-sm text-foreground/70">
          Dora is asking: “{view.progress.activeQuestion.text}” · waiting for the answer
        </li>
      )}
    </ol>
  );
}
