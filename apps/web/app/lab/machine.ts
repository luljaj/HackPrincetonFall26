// Assistant-mode stage machine. Pure: (context, event) -> context. No DOM, no React.
import policy from "./learning-policy.json" with { type: "json" };

export type Stage =
  | "watching" | "entering" | "asking" | "listening" | "nudging" | "thinking"
  | "celebrating" | "teaching" | "modeling" | "clarifying" | "giving" | "graceful" | "practicing"
  | "exiting" | "away" | "welcome" | "paused";

export type Event =
  | "PAUSE_POINT" | "TRANSITION_DONE" | "LINE_DONE" | "SPEECH_END" | "SILENCE"
  | "CORRECT" | "WRONG" | "UNCLEAR" | "ERROR" | "AWAY" | "BACK" | "PAUSE" | "RESUME";

// known: this spot has a known answer, so Dora can model it ("It's a seatbelt! Can you say seatbelt?").
// modeled: she already did, so the next answer is the kid's repeat.
// practice: the kid is learning another language and this answer has a translation, so after the answer
// Dora teaches the word in that language ("In French, seatbelt is ceinture! Can you say ceinture?").
// practiced: she did, so the next answer is the kid saying the word (nudges counts coached retries).
export type Ctx = {
  stage: Stage; tries: number; nudges: number; awayFrom: Stage | null; pausedFrom: Stage | null;
  practiceOnly: boolean; known: boolean; modeled: boolean; practice: boolean; practiced: boolean;
};

// Teaching ladder on wrong answers: hint (teach1) → choices (teach2) → model + repeat → warm give.
export const MAX_TRIES = 3; // wrong answers before Dora models the answer
export const MAX_NUDGES = 1; // silent or mumbled turns before Dora moves on

export const INITIAL: Ctx = { stage: "watching", tries: 0, nudges: 0, awayFrom: null, pausedFrom: null, practiceOnly: false, known: false, modeled: false, practice: false, practiced: false };

// What each stage looks and sounds like. `line` = pre-made audio, `rest` = loop shown when not talking.
export const STAGES: Record<Stage, { assistant: boolean; line?: string; rest: "wait" | "happy" }> = {
  watching: { assistant: false, rest: "wait" },
  paused: { assistant: false, rest: "wait" },
  entering: { assistant: true, rest: "wait" },
  asking: { assistant: true, line: "ask", rest: "wait" },
  listening: { assistant: true, rest: "wait" },
  nudging: { assistant: true, line: "nudge", rest: "wait" },
  thinking: { assistant: true, rest: "wait" },
  celebrating: { assistant: true, line: "celebrate", rest: "happy" },
  teaching: { assistant: true, line: "teach", rest: "wait" }, // teach1, teach2 by tries
  modeling: { assistant: true, line: "model", rest: "wait" },
  practicing: { assistant: true, line: "practice", rest: "wait" },
  clarifying: { assistant: true, line: "clarify", rest: "wait" },
  giving: { assistant: true, line: "give", rest: "happy" },
  graceful: { assistant: true, line: "graceful", rest: "happy" },
  exiting: { assistant: true, rest: "wait" },
  away: { assistant: false, rest: "wait" },
  welcome: { assistant: true, line: "welcome", rest: "wait" },
};

export const STAGE_NAMES = Object.keys(STAGES) as [Stage, ...Stage[]];

// The kid's answer at a pause is settled once Dora praises it, gives it, or bows out. What follows is
// language practice or the exit. The session record (lib/play/trace.ts) folds outcomes from these.
export const SETTLES: ReadonlySet<Stage> = new Set<Stage>(["celebrating", "giving", "graceful"]);
export const answeredFirstTry = (c: { tries: number; nudges: number; modeled: boolean }) => c.tries === 0 && c.nudges === 0 && !c.modeled;

export function next(c: Ctx, e: Event): Ctx {
  const to = (stage: Stage, extra: Partial<Ctx> = {}): Ctx => ({ ...c, ...extra, stage });
  // Out of hints/patience: show the answer and invite a repeat if we know it, else let the show reveal it.
  const stuck = () => (c.known && !c.modeled ? to("modeling") : to("giving"));

  if (c.stage === "paused") return e === "RESUME" ? to(c.pausedFrom === "thinking" ? "listening" : c.pausedFrom ?? "watching", { pausedFrom: null }) : c;
  if (e === "PAUSE") return to("paused", { pausedFrom: c.stage });
  if (e === "AWAY" && c.stage !== "away") return to("away", { awayFrom: c.stage });
  if (e === "BACK" && c.stage === "away") {
    const wasAssisting = c.awayFrom !== null && STAGES[c.awayFrom].assistant && c.awayFrom !== "exiting";
    return to(wasAssisting ? "welcome" : "watching", { awayFrom: null });
  }

  switch (c.stage) {
    case "watching":
      return e === "PAUSE_POINT" ? to("entering", { tries: 0, nudges: 0, modeled: false, practiced: false }) : c;
    case "entering":
      return e === "TRANSITION_DONE" ? to(c.practiceOnly ? "practicing" : "asking") : c;
    case "asking":
    case "nudging":
    case "teaching":
    case "clarifying":
    case "welcome":
      return e === "LINE_DONE" ? to("listening") : c;
    case "modeling":
      return e === "LINE_DONE" ? to("listening", { modeled: true }) : c;
    case "practicing":
      return e === "LINE_DONE" ? to("listening", { practiced: true, nudges: c.practiced ? c.nudges : 0 }) : c;
    case "listening":
      if (e === "SPEECH_END") return to("thinking");
      if (e === "SILENCE" && c.practiced) return to("giving"); // language practice: one try, never nag
      if (e === "SILENCE") return c.nudges < MAX_NUDGES ? to("nudging", { nudges: c.nudges + 1 }) : stuck();
      return c;
    case "thinking":
      if (c.practiced) {
        if (e === "CORRECT") return to("celebrating");
        if (e === "WRONG") return c.nudges + 1 < policy.practice.maxAttempts ? to("practicing", { nudges: c.nudges + 1 }) : to("giving");
        if (e === "UNCLEAR") return to("giving");
      }
      if (e === "CORRECT") return to("celebrating");
      if (e === "WRONG") return c.modeled ? to("giving") : c.tries + 1 < MAX_TRIES ? to("teaching", { tries: c.tries + 1 }) : stuck();
      if (e === "UNCLEAR") return c.nudges < MAX_NUDGES ? to("clarifying", { nudges: c.nudges + 1 }) : stuck();
      if (e === "ERROR") return to("graceful");
      return c;
    case "celebrating":
    case "giving":
      if (e !== "LINE_DONE") return c;
      return c.practice && !c.practiced ? to("practicing") : to("exiting"); // then learn it in the new language
    case "graceful":
      return e === "LINE_DONE" ? to("exiting") : c;
    case "exiting":
      return e === "TRANSITION_DONE" ? to("watching") : c;
    default:
      return c;
  }
}

// Events that do something in this context (for enabling buttons).
export const EVENTS: Event[] = [
  "PAUSE_POINT", "TRANSITION_DONE", "LINE_DONE", "SPEECH_END", "SILENCE",
  "CORRECT", "WRONG", "UNCLEAR", "ERROR", "AWAY", "BACK", "PAUSE", "RESUME",
];
export const validEvents = (c: Ctx) => EVENTS.filter((e) => next(c, e) !== c);
