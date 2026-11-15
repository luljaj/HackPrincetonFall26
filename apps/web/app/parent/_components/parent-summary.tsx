import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { assistanceCountWording, statusLabel } from "../../../lib/parent/wording";
import type { SessionProgress } from "../../../lib/parent/types";

export function ParentSummary({ episode }: { episode: SessionProgress["episode"] }) {
  return (
    <Card className="gap-2 px-5 py-4">
      <CardHeader className="gap-1 px-0">
        <CardDescription className="text-xs">Summary</CardDescription>
        {episode.parentSummary && (
          <CardTitle className="text-2xl leading-[1.35]">{episode.parentSummary}</CardTitle>
        )}
      </CardHeader>
      <CardFooter className="px-0 text-muted-foreground">
        Latest answer: {statusLabel(episode.finalStatus)} ·{" "}
        {assistanceCountWording(episode.responsesWithAssistance)}
      </CardFooter>
    </Card>
  );
}
