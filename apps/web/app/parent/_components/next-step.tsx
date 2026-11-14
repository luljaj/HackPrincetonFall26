import { nextStepFor } from "../../../lib/parent/next-steps";

export function NextStep({ objectiveId }: { objectiveId: string }) {
  const tip = nextStepFor(objectiveId);
  if (!tip) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm text-foreground/60">Try at home</h2>
      <p>{tip}</p>
    </section>
  );
}
