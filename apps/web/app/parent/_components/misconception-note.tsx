import { misconceptionWording } from "../../../lib/parent/wording";

export function MisconceptionNote({ misconception }: { misconception: string | null }) {
  if (!misconception) return null;
  return <p className="text-sm italic text-foreground/80">{misconceptionWording(misconception)}</p>;
}
