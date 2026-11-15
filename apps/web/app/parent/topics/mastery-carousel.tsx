"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Native scrolling keeps touch and trackpad gestures interruptible. */
export function MasteryCarousel({ children, label }: { children: ReactNode; label: string }) {
  const cards = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, cards.length - 1));
  function go(next: number, instant = false) {
    const element = track.current;
    const card = element?.children[next] as HTMLElement | undefined;
    if (!element || !card) return;
    element.scrollTo({ left: card.offsetLeft - (element.firstElementChild as HTMLElement).offsetLeft,
      behavior: instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  if (!cards.length) return <p className="mastery-card-blurb">No {label.toLowerCase()} available yet.</p>;
  return <section className="mastery-carousel" aria-label={label} aria-roledescription="carousel">
    <div className="mastery-carousel-controls">
      <span aria-live="polite">{current + 1} / {cards.length} · {label}</span>
      <div>
        <button type="button" aria-label={`Previous ${label.toLowerCase()} card`} disabled={current === 0} onClick={event => go(current - 1, event.detail === 0)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label={`Next ${label.toLowerCase()} card`} disabled={current === cards.length - 1} onClick={event => go(current + 1, event.detail === 0)}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div ref={track} className="mastery-carousel-track" tabIndex={0} aria-label={`Swipe or use arrow keys to browse ${label.toLowerCase()}`}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        go(event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, current + (event.key === "ArrowRight" ? 1 : -1))), true);
      }}
      onScroll={event => {
        const element = event.currentTarget;
        const width = (element.children[1] as HTMLElement | undefined)?.offsetLeft;
        const first = (element.children[0] as HTMLElement | undefined)?.offsetLeft ?? 0;
        setIndex(width ? Math.round(element.scrollLeft / (width - first)) : 0);
      }}>
      {cards.map((card, i) => <div className="mastery-carousel-slide" key={typeof card === "object" && "key" in card ? card.key : i} inert={i !== current} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${cards.length}`}>{card}</div>)}
    </div>
  </section>;
}
