import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    // Yellow outline: this is the thing in focus right now.
    <Card
      aria-live="polite"
      className="gap-1 border-2 border-primary px-5 py-4"
      data-question-id={question.questionId}
    >
      <CardHeader className="gap-1 px-0">
        <CardDescription className="text-xs">
          {hasAnswers ? "Dora is asking a follow-up" : "Dora is asking"}
        </CardDescription>
        <CardTitle className="text-2xl leading-[1.35]">{question.text}</CardTitle>
      </CardHeader>
      <CardFooter className="px-0 text-muted-foreground">Waiting for the answer…</CardFooter>
    </Card>
  );
}
