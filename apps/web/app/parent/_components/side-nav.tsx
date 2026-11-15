"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The parent view is one scrolling page: each item scrolls to its section on /parent and lights up while
// you're reading that section. From a detail page (e.g. one session) the items jump back into that page.
// section null = not available here; shown greyed so the layout matches the design.
export function SideNav({ items }: { items: Array<{ label: string; section: string | null }> }) {
  const onPage = usePathname() === "/parent";
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [keyboard, setKeyboard] = useState(false);
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

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !onPage) return;
    const update = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="location"]');
      if (!active) return;
      setIndicator({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, [current, onPage]);

  return (
    <nav className="parent-nav" aria-label="Navigate">
      <p className="parent-nav-label">Navigate</p>
      <div className="parent-nav-list" ref={listRef} data-keyboard={keyboard} onPointerDown={() => setKeyboard(false)} onWheel={() => setKeyboard(false)}>
      {indicator && <span aria-hidden="true" className="parent-nav-indicator" style={{ transform: `translate(${indicator.x}px, ${indicator.y}px)`, width: indicator.width, height: indicator.height }} />}
      {items.map(({ label, section }) => {
        const active = onPage && section === current;
        const cls = `parent-nav-item ${active ? "is-active" : ""}`;
        const body = (
          <span className="parent-nav-content">
            {/* Exact 24px icons exported from the sidebar in Figma. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/figma/home-img${label}1.svg`} alt="" width={24} height={24} />
            {label}
          </span>
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
            className={cls}
            aria-current={active ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              const instant = e.detail === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              setKeyboard(e.detail === 0);
              document.getElementById(section)?.scrollIntoView({ behavior: instant ? "instant" : "smooth", block: "start" });
              history.replaceState(null, "", `#${section}`);
            }}
          >
            {body}
          </a>
        ) : (
          <Link key={label} href={`/parent#${section}`} className={cls}>
            {body}
          </Link>
        );
      })}
      </div>
      <div className="parent-profile-switch">
        <p className="parent-nav-label">Switch Profile</p>
        <Link href="/" className="parent-kid-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/home-imgTv1.svg" alt="" width={24} height={24} />
          Kid mode
        </Link>
      </div>
    </nav>
  );
}
