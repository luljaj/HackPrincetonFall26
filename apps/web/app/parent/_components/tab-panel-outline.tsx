"use client";

import { useEffect, useId, useRef, useState } from "react";

// The selected show's background: a tab joined to the insights panel as one shape.
// The curves are copied from the Figma "Union" node (14:416): corner radius 48 with 100% corner
// smoothing on the outer corners, and the 70px concave join where the tab meets the panel.
// SVG paths can't use percentages, so the element is measured and the path rebuilt on resize.

export const TAB_WIDTH = 427;
export const TAB_HEIGHT = 166; // 96 (outer corner) + 70 (concave join), as in Figma

const n = (v: number) => v.toFixed(2);

/** One smoothed convex corner at (cx, cy). `u` is the direction of travel into it, `v` out of it. */
function corner(cx: number, cy: number, u: [number, number], v: [number, number]): string {
  const p = (a: number, b: number) => `${n(cx + u[0] * a + v[0] * b)} ${n(cy + u[1] * a + v[1] * b)}`;
  return (
    `L${p(-96, 0)}C${p(-50.745, 0)} ${p(-28.117, 0)} ${p(-14.059, 14.059)}` +
    `C${p(0, 28.1175)} ${p(0, 50.7452)} ${p(0, 96)}`
  );
}

function outline(w: number, h: number): string {
  const tw = TAB_WIDTH;
  const th = TAB_HEIGHT;
  const R: [number, number] = [1, 0];
  const D: [number, number] = [0, 1];
  const L: [number, number] = [-1, 0];
  const U: [number, number] = [0, -1];
  // Too narrow for the tab plus the join: fall back to one smoothed rectangle.
  const hasTab = w >= tw + 70 + 96 && h >= th + 192;
  const top = hasTab
    ? corner(tw, 0, R, D) +
      // Concave join, relative to the point where the tab's right edge meets the panel's top edge.
      `C${n(tw)} ${n(th - 62.57)} ${n(tw)} ${n(th - 58.856)} ${n(tw + 0.318)} ${n(th - 55.728)}` +
      `C${n(tw + 3.296)} ${n(th - 26.448)} ${n(tw + 26.448)} ${n(th - 3.296)} ${n(tw + 55.728)} ${n(th - 0.318)}` +
      `C${n(tw + 58.856)} ${n(th)} ${n(tw + 62.57)} ${n(th)} ${n(tw + 70)} ${n(th)}` +
      corner(w, th, R, D)
    : corner(w, 0, R, D);
  return `M96 0${top}${corner(w, h, D, L)}${corner(0, h, L, U)}${corner(0, 0, U, R)}Z`;
}

export function TabPanelOutline({ art }: { art?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = size ? outline(size.w, size.h) : null;

  return (
    <svg
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ filter: "drop-shadow(0 0 46px rgb(0 0 0 / 0.1))" }}
    >
      {d && (
        <>
          <defs>
            <clipPath id={`${id}clip`}>
              <path d={d} />
            </clipPath>
            {/* The Figma fill over the artwork: panel grey, 28% at the top to solid at 125px. */}
            <linearGradient id={`${id}fade`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="125">
              <stop offset="0" stopColor="var(--color-tv-panel)" stopOpacity={art ? 0.28 : 1} />
              <stop offset="1" stopColor="var(--color-tv-panel)" />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${id}clip)`}>
            <path d={d} fill="var(--color-tv-page)" />
            {art && (
              <image
                href={art}
                width={TAB_WIDTH}
                height={239}
                opacity={0.48}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            <path d={d} fill={`url(#${id}fade)`} />
            {/* 4px inside stroke: an 8px stroke with the outer half clipped away. */}
            <path d={d} fill="none" stroke="var(--color-tv-yellow)" strokeWidth={8} />
          </g>
        </>
      )}
    </svg>
  );
}
