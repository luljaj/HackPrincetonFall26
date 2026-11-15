"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Tv } from "./stat-icons";

// The parent view is one scrolling page: each item scrolls to its section on /parent and lights up while
// you're reading that section. From a detail page (e.g. one session) the items jump back into that page.
// section null = not available here; shown greyed so the layout matches the design.
export function SideNav({ items }: { items: Array<{ label: string; section: string | null }> }) {
  const onPage = usePathname() === "/parent";
  const sections = items.flatMap((i) => (i.section ? [i.section] : []));
  const [current, setCurrent] = useState(sections[0]);

  // Highlight the last section whose top has passed the upper third of the screen (or the last one at the bottom).
  useEffect(() => {
    if (!onPage) return;
    const update = () => {
      const line = window.innerHeight * 0.33;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = sections.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setCurrent(atBottom ? sections[sections.length - 1] : (passed[passed.length - 1] ?? sections[0]));
    };
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the section list is fixed per render
  }, [onPage]);

  return (
    <nav className="grid gap-3 text-[15px]" aria-label="Navigate">
      <p className="mb-1 pl-1 text-[22px] text-foreground/80">Navigate</p>
      {items.map(({ label, section }) => {
        const active = onPage && section === current;
        const cls = `flex h-[52px] items-center gap-3 rounded-2xl px-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors ${
          active ? "bg-white" : "bg-white/50 pl-[60px]"
        }`;
        const body = (
          <>
            {active && <span className="scale-90">{Tv}</span>}
            {label}
          </>
        );
        if (!section) {
          return (
            <span key={label} className={`${cls} text-foreground/35`} title="Not available">
              {body}
            </span>
          );
        }
        return onPage ? (
          <a
            key={label}
            href={`#${section}`}
            className={`${cls} hover:bg-white`}
            aria-current={active ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
              history.replaceState(null, "", `#${section}`);
              setCurrent(section);
            }}
          >
            {body}
          </a>
        ) : (
          <Link key={label} href={`/parent#${section}`} className={`${cls} hover:bg-white`}>
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
