"use client";

import { useRouter } from "next/navigation";
import { subscribeToSession } from "../../../lib/parent/subscribe";
import { useEffect } from "react";

// The parent view is one page made of several sections, more than one of which asks for a refresh:
// only the first mounted timer runs, so the page refreshes once per interval, not once per section.
let running = 0;

/** Re-renders the server page on an interval while the tab is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    if (running++ > 0) return () => { running--; };
    const stop = subscribeToSession("live", () => router.refresh());
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => { running--; stop(); window.clearInterval(id); };
  }, [router, seconds]);
  return null;
}
