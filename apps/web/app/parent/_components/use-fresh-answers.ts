"use client";

import { useEffect, useRef, useState } from "react";
import { findFreshIds, HIGHLIGHT_MS } from "../../../lib/parent/highlight";
import type { ProgressInteraction } from "../../../lib/parent/types";

/**
 * Tracks answers that arrived after this view mounted. Each stays "fresh" for HIGHLIGHT_MS.
 * The newest fresh answer is scrolled into view (instantly if the viewer prefers reduced motion).
 */
export function useFreshAnswers(interactions: readonly ProgressInteraction[]): ReadonlySet<string> {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const seen = useRef<ReadonlySet<string> | null>(null);
  const timers = useRef<number[]>([]);
  const idsKey = interactions.map((i) => i.interactionId).join(",");

  useEffect(() => {
    const result = findFreshIds(seen.current, idsKey ? idsKey.split(",") : []);
    seen.current = result.seen;
    const arrived = result.fresh;
    if (arrived.length === 0) return;

    setFresh((prev) => new Set([...prev, ...arrived]));
    timers.current.push(
      window.setTimeout(() => {
        setFresh((prev) => new Set([...prev].filter((id) => !arrived.includes(id))));
      }, HIGHLIGHT_MS),
    );

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`answer-${arrived[arrived.length - 1]}`)
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [idsKey]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  return fresh;
}
