import type { PublicQuestion } from "../../../lib/parent/types";

// The question Dora is asking right now (learning-progress-plan.md §2, §5): after a wrong answer
// this is the variant, shown before the child answers it. Null once the moment is over.
export function ActiveQuestion({
  question,
  hasAnswers,
}: {
  question: PublicQuestion | null;
  hasAnswers: boolean;
}) {
  if (!question) return null;
  return (
    <section
      aria-live="polite"
      className="space-y-1 rounded border border-foreground/30 p-4"
      data-question-id={question.questionId}
    >
      <h2 className="text-sm text-foreground/60">
        {hasAnswers ? "Dora is asking a follow-up" : "Dora is asking"}
      </h2>
      <p className="text-lg">{question.text}</p>
      <p className="text-sm text-foreground/60">Waiting for the answer…</p>
    </section>
  );
}
