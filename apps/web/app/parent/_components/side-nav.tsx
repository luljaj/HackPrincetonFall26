"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tv } from "./stat-icons";

// href null = page not built yet; shown greyed so the layout matches the design.
export function SideNav({ items }: { items: Array<{ label: string; href: string | null }> }) {
  const path = usePathname();
  return (
    <nav className="grid gap-3 text-[15px]" aria-label="Navigate">
      <p className="mb-1 pl-1 text-[22px] text-foreground/80">Navigate</p>
      {items.map(({ label, href }) => {
        const active = href === "/parent" ? path === href : !!href && path.startsWith(href);
        const cls = `flex h-[52px] items-center gap-3 rounded-2xl px-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
          active ? "bg-white" : "bg-white/50 pl-[60px]"
        }`;
        const body = (
          <>
            {active && <span className="scale-90">{Tv}</span>}
            {label}
          </>
        );
        return href ? (
          <Link key={label} href={href} className={`${cls} hover:bg-white`} aria-current={active ? "page" : undefined}>
            {body}
          </Link>
        ) : (
          <span key={label} className={`${cls} text-foreground/35`} title="Coming soon">
            {body}
          </span>
        );
      })}
    </nav>
  );
}
