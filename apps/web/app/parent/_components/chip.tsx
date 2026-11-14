import type { ChipTone } from "../../../lib/parent/wording";

const tones: Record<ChipTone, string> = {
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  muted: "bg-foreground/5 text-foreground/60",
};

export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
