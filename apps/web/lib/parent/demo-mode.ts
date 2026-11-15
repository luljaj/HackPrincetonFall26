// Demo Mode: a per-browser presentation switch (Settings). While it's on, the
// companion applies rehearsed commands through the real write tools without asking the model.
import { DEFAULT_FOCUS, PLAN_LANGUAGES, type Focus } from "./preferences";
import { CATEGORIES } from "../play/mastery";

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
  return !/\b(no|not|never|don t|do not|stop|less|spanish|french|german|chinese|hindi|japanese)\b/.test(text)
    && /\bmore\b/.test(text) && /\baddition\b|\badding\b|\badd\b/.test(text);
}

/** Where the demo starts: a balanced mix, so Numbers has room to crank up. */
export const DEMO_START_FOCUS: Focus = DEFAULT_FOCUS;

export function demoAnswer(child: string, before: Focus) {
  const after: Focus = { ...before, numbers: "more" }; // a mastery category (app/lab/mastery.json)
  return {
    after,
    headline: `More addition for ${child}`,
    reply: before.numbers === "more"
      ? `Numbers is already turned up for ${child}. Extra addition questions follow the episode's number pauses.`
      : `An addition question is queued for ${child}, after the current answer. Numbers is turned up for the next teaching moments.`,
  };
}

/** Rehearsed commands use the real write tools, without a model round trip. Ambiguity goes to the model. */
export function demoCommand(prompt: string) {
  const text = prompt.toLowerCase().replace(/[.!?]+$/g, "").trim().replace(/\s+(now|please|right now)$/g, "");
  if (/\b(not|never|don'?t|do not)\b/.test(text)) return undefined;
  if (/\b(and|then|also|addition|adding)\b/.test(text)) return undefined;
  const names = ["english", "spanish", "french", "german", "chinese", "hindi", "japanese"];
  const language = names.findIndex(name => new RegExp(`\\b${name}$`).test(text));
  if (/^(please )?(switch|change|set|teach)\b/.test(text) && language >= 0) {
    return { name: "set_language" as const, arguments: JSON.stringify({ language: PLAN_LANGUAGES[language] }) };
  }
  if (!/^(please )?(reset|start)\b/.test(text)) return undefined;
  if (/\b(current|topic he.s on|topic he is on|working on)\b/.test(text)) {
    return { name: "reset_skill" as const, arguments: JSON.stringify({ skill: null, category: null, current: true }) };
  }
  const categories = CATEGORIES.filter(c => new RegExp(`\\b${c.id === "numbers" ? "(counting|numbers)" : c.id}\\b`).test(text));
  return categories.length === 1 ? { name: "reset_skill" as const, arguments: JSON.stringify({ skill: null, category: categories[0]!.id, current: null }) } : undefined;
}
