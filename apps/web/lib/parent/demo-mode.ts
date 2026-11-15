// Demo Mode: a per-browser presentation switch (Settings). While it's on, the
// companion answers the one rehearsed prompt instantly instead of asking the model.
import { DEFAULT_FOCUS, type Focus } from "./preferences";

export const DEMO_MODE_KEY = "tellavision-demo-mode";
export const DEMO_MODE_EVENT = "tellavision-demo-mode";

export function readDemoMode(): boolean {
  try {
    return window.localStorage.getItem(DEMO_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeDemoMode(on: boolean) {
  try {
    window.localStorage.setItem(DEMO_MODE_KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new CustomEvent<boolean>(DEMO_MODE_EVENT, { detail: on }));
}

/** "Make Sam learn more about addition", give or take wording and punctuation. */
export function isDemoPrompt(prompt: string): boolean {
  const text = prompt.toLowerCase().replace(/[^a-z ]+/g, " ");
  return /\bmore\b/.test(text) && /\baddition\b|\badding\b|\badd\b/.test(text);
}

/** Where the demo starts: a balanced mix, so Math has room to crank up. */
export const DEMO_START_FOCUS: Focus = DEFAULT_FOCUS;

export function demoAnswer(child: string, before: Focus) {
  const after: Focus = { ...before, math: "more" };
  return {
    after,
    headline: `More addition for ${child}`,
    reply: `Done. Math is turned up, so ${child} will get more addition moments while watching. English and Science stay as they were.`,
  };
}
