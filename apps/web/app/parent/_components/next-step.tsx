import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { nextStepFor } from "../../../lib/parent/next-steps";

export function NextStep({ objectiveId }: { objectiveId: string }) {
  const tip = nextStepFor(objectiveId);
  if (!tip) return null;
  return (
    <Card className="gap-1 px-5 py-4">
      <CardHeader className="px-0">
        <CardDescription className="text-xs">Try at home</CardDescription>
      </CardHeader>
      <CardContent className="px-0">{tip}</CardContent>
    </Card>
  );
}
