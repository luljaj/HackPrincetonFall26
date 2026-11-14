// Assistant-mode stage machine. Pure: (context, event) -> context. No DOM, no React.

export type Stage =
  | "watching" | "entering" | "asking" | "listening" | "nudging" | "thinking"
  | "celebrating" | "teaching" | "clarifying" | "giving" | "graceful"
  | "exiting" | "away" | "welcome";

export type Event =
  | "PAUSE_POINT" | "TRANSITION_DONE" | "LINE_DONE" | "SPEECH_END" | "SILENCE"
  | "CORRECT" | "WRONG" | "UNCLEAR" | "ERROR" | "AWAY" | "BACK";

export type Ctx = { stage: Stage; tries: number; nudges: number; awayFrom: Stage | null };

export const MAX_TRIES = 2; // wrong answers before Dora gives the answer
export const MAX_NUDGES = 1; // silent turns before Dora gives the answer

export const INITIAL: Ctx = { stage: "watching", tries: 0, nudges: 0, awayFrom: null };

// What each stage looks and sounds like. `line` = pre-made audio, `rest` = loop shown when not talking.
export const STAGES: Record<Stage, { assistant: boolean; line?: string; rest: "wait" | "happy" }> = {
  watching: { assistant: false, rest: "wait" },
  entering: { assistant: true, rest: "wait" },
  asking: { assistant: true, line: "ask", rest: "wait" },
  listening: { assistant: true, rest: "wait" },
  nudging: { assistant: true, line: "nudge", rest: "wait" },
  thinking: { assistant: true, rest: "wait" },
  celebrating: { assistant: true, line: "celebrate", rest: "happy" },
  teaching: { assistant: true, line: "teach", rest: "wait" },
  clarifying: { assistant: true, line: "clarify", rest: "wait" },
  giving: { assistant: true, line: "give", rest: "happy" },
  graceful: { assistant: true, line: "graceful", rest: "happy" },
  exiting: { assistant: true, rest: "wait" },
  away: { assistant: false, rest: "wait" },
  welcome: { assistant: true, line: "welcome", rest: "wait" },
};

export function next(c: Ctx, e: Event): Ctx {
  const to = (stage: Stage, extra: Partial<Ctx> = {}): Ctx => ({ ...c, ...extra, stage });

  if (e === "AWAY" && c.stage !== "away") return to("away", { awayFrom: c.stage });
  if (e === "BACK" && c.stage === "away") {
    const wasAssisting = c.awayFrom !== null && STAGES[c.awayFrom].assistant && c.awayFrom !== "exiting";
    return to(wasAssisting ? "welcome" : "watching", { awayFrom: null });
  }

  switch (c.stage) {
    case "watching":
      return e === "PAUSE_POINT" ? to("entering", { tries: 0, nudges: 0 }) : c;
    case "entering":
      return e === "TRANSITION_DONE" ? to("asking") : c;
    case "asking":
    case "nudging":
    case "teaching":
    case "clarifying":
    case "welcome":
      return e === "LINE_DONE" ? to("listening") : c;
    case "listening":
      if (e === "SPEECH_END") return to("thinking");
      if (e === "SILENCE") return c.nudges < MAX_NUDGES ? to("nudging", { nudges: c.nudges + 1 }) : to("giving");
      return c;
    case "thinking":
      if (e === "CORRECT") return to("celebrating");
      if (e === "WRONG") return c.tries + 1 < MAX_TRIES ? to("teaching", { tries: c.tries + 1 }) : to("giving");
      if (e === "UNCLEAR") return to("clarifying");
      if (e === "ERROR") return to("graceful");
      return c;
    case "celebrating":
    case "giving":
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
  "CORRECT", "WRONG", "UNCLEAR", "ERROR", "AWAY", "BACK",
];
export const validEvents = (c: Ctx) => EVENTS.filter((e) => next(c, e) !== c);
