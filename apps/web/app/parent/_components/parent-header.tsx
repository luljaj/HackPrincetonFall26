import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { demoToolsEnabled } from "../../../lib/parent/demo";
import { FamilyIcon } from "./tv-icons";

/** Brand block (top-left) and page links (top-right), shown on every parent page. */
export function ParentHeader({ showNav }: { showNav: boolean }) {
  const links = [
    { href: "/parent", label: "Home" },
    { href: "/parent/live", label: "Live now" },
    { href: "/parent/preview", label: "By subject (sample)" },
    ...(demoToolsEnabled() ? [{ href: "/parent/insights", label: "Insights" }] : []),
  ];
  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex flex-col items-start gap-2.5">
        <Link href="/parent" className="font-display text-xl font-bold text-[#161616]">
          Tellavision
        </Link>
        <Badge className="gap-2.5 px-[9px] py-1 text-base text-tv-badge [--r:11px] [&>svg]:size-5">
          <FamilyIcon />
          Parent View
        </Badge>
      </div>
      {showNav && (
        <nav aria-label="Parent pages" className="flex flex-col items-end gap-2">
          <p className="text-base">Go to</p>
          <div className="flex flex-wrap justify-end gap-[7px]">
            {links.map((l) => (
              <Badge key={l.href} asChild variant="outline">
                <Link href={l.href}>{l.label}</Link>
              </Badge>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
