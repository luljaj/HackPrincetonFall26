import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function SessionHeader({
  objective,
  isSample,
}: {
  objective: string;
  isSample: boolean;
}) {
  return (
    <header className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge asChild variant="outline">
          <Link href="/parent">← All sessions</Link>
        </Badge>
        {isSample && <Badge variant="outline">Sample data</Badge>}
      </div>
      <p className="mt-2 text-muted-foreground">Learning goal</p>
      <h1 className="font-display text-[32px] font-bold">{objective}</h1>
    </header>
  );
}
