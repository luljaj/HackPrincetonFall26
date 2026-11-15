import { Badge } from "@/components/ui/badge";
import type { ChipTone } from "../../../lib/parent/wording";

// Status chip in the Tellavision look: yellow marks a correct answer, everything else is a quiet
// white chip. State is carried by the wording, not by red/green/amber.
export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return <Badge variant={tone === "good" ? "default" : "outline"}>{children}</Badge>;
}
