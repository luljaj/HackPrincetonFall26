import { misconceptionWording } from "../../../lib/parent/wording";

export function MisconceptionNote({ misconception }: { misconception: string | null }) {
  if (!misconception) return null;
  return <p className="text-muted-foreground">{misconceptionWording(misconception)}</p>;
}
