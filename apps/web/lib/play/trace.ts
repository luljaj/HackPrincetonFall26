// Play-session trace: what Play mode records while the kid watches, and how a session's events fold
// into one row per pause (a "turn"). Shared by the player (sends), the API (validates) and storage (folds).
import { z } from "zod";
import { skillInfo } from "./skills";

export const STAGES_SAVED = [
  "entering", "asking", "listening", "nudging", "thinking", "celebrating", "teaching", "modeling",
  "clarifying", "giving", "graceful", "practicing", "exiting", "watching", "away", "welcome",
] as const;

const short = (n: number) => z.string().trim().max(n);

export const PlayEventSchema = z.strictObject({
  seq: z.number().int().nonnegative(), // per session, so retried batches can't double-save
  at: z.number().int().positive(), // epoch ms on the kid's device
  type: z.enum(["session_start", "stage", "heard", "judged", "pronounced", "language", "session_end"]),
  turnId: z.uuid().optional(), // set from "entering" until back to "watching"
  spotId: short(40).optional(),
  // stage
  stage: z.enum(STAGES_SAVED).optional(),
  tries: z.number().int().min(0).max(20).optional(),
  nudges: z.number().int().min(0).max(20).optional(),
  modeled: z.boolean().optional(),
  practiced: z.boolean().optional(),
  question: short(300).optional(),
  skill: short(40).optional(),
  word: short(60).optional(), // practising: the word in the learning language
  answer: short(300).optional(), // what Dora expects at this pause (lessons.json); "" for open questions
  moment: z.number().min(0).max(36_000).optional(), // where in the episode the show paused, in seconds
  // heard / pronounced
  text: short(500).optional(), // what the kid said (parent-only; never sent to Convex)
  verdict: z.enum(["correct", "wrong", "unclear", "good", "close", "retry", "silent"]).optional(),
  say: short(400).optional(), // Dora's reply line
  source: z.enum(["luna", "instant"]).optional(),
  ms: z.number().int().min(0).max(120_000).optional(),
  // session / language
  language: z.string().regex(/^[a-z]{2,3}$/).or(z.literal("")).optional(),
  episodeId: short(60).optional(),
  watchedSeconds: z.number().min(0).max(36_000).optional(),
});
export type PlayEvent = z.infer<typeof PlayEventSchema>;

export const PlayBatchSchema = z.strictObject({
  sessionId: z.uuid(),
  episodeId: short(60).min(1),
  events: z.array(PlayEventSchema).min(1).max(200),
});
export type PlayBatch = z.infer<typeof PlayBatchSchema>;

export type TurnOutcome = "first_try" | "after_help" | "gave" | "no_answer" | "error";
export type PlayTurn = {
  turnId: string;
  turnNumber: number;
  spotId: string;
  question: string;
  expectedAnswer: string | null; // null: open question, any sensible answer
  momentSeconds: number | null; // episode timestamp of the pause
  skill: string;
  topic: string;
  subject: string;
  startedAt: number;
  endedAt: number;
  outcome: TurnOutcome | null; // null: still at this pause, or left before it finished
  answerStatus: "correct" | "incorrect" | "unclear" | "not_assessed";
  tries: number;
  nudges: number;
  transcript: string; // everything the kid said at this pause, " / " separated
  doraReply: string | null;
  replyMs: number | null;
  pronunciation: string | null;
  practiceLanguage: string | null;
  practiceWord: string | null;
  practiceOutcome: "good" | "missed" | null;
};

export type PlaySessionSummary = {
  sessionId: string;
  episodeId: string;
  language: string;
  startedAt: number;
  lastEventAt: number;
  endedAt: number | null;
  watchedSeconds: number | null;
};

/** Folds one session's events (any order) into its session summary and turns. Pure. */
export function foldSession(sessionId: string, episodeId: string, events: readonly PlayEvent[]) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const session: PlaySessionSummary = {
    sessionId, episodeId, language: "", startedAt: sorted[0]?.at ?? Date.now(),
    lastEventAt: sorted.at(-1)?.at ?? Date.now(), endedAt: null, watchedSeconds: null,
  };
  const turns = new Map<string, PlayTurn & { heard: string[]; spoke: boolean }>();
  let practiceLanguage = "";

  for (const e of sorted) {
    if (e.language !== undefined && (e.type === "session_start" || e.type === "language")) {
      session.language = e.language;
      practiceLanguage = e.language;
    }
    if (e.type === "session_end") {
      session.endedAt = e.at;
      session.watchedSeconds = e.watchedSeconds ?? null;
    }
    if (!e.turnId) continue;
    let t = turns.get(e.turnId);
    if (!t) {
      const info = skillInfo(e.skill);
      t = {
        turnId: e.turnId, turnNumber: turns.size + 1, spotId: e.spotId ?? "unknown", question: e.question ?? "",
        expectedAnswer: e.answer || null, momentSeconds: e.moment ?? null,
        skill: e.skill ?? "other", topic: info.topic, subject: info.subject, startedAt: e.at, endedAt: e.at,
        outcome: null, answerStatus: "not_assessed", tries: 0, nudges: 0, transcript: "", doraReply: null,
        replyMs: null, pronunciation: null, practiceLanguage: null, practiceWord: null, practiceOutcome: null,
        heard: [], spoke: false,
      };
      turns.set(e.turnId, t);
    }
    t.endedAt = Math.max(t.endedAt, e.at);
    if (e.question && !t.question) t.question = e.question;
    if (e.answer && !t.expectedAnswer) t.expectedAnswer = e.answer;
    if (e.moment !== undefined && t.momentSeconds === null) t.momentSeconds = e.moment;

    if (e.type === "heard" && e.text?.trim()) {
      t.heard.push(e.text.trim());
      t.spoke = true;
    }
    if (e.type === "judged") {
      if (e.say) t.doraReply = e.say;
      if (e.ms !== undefined) t.replyMs = e.ms;
      if (e.verdict && e.verdict !== "unclear") t.spoke = true;
    }
    if (e.type === "pronounced") {
      t.pronunciation = e.verdict ?? null;
      if (e.verdict && e.verdict !== "silent") t.spoke = true;
    }
    if (e.type !== "stage" || !e.stage) continue;

    if (e.stage === "practicing") {
      t.practiceLanguage = practiceLanguage || null;
      t.practiceWord = e.word ?? null;
    }
    const ends = e.stage === "celebrating" || e.stage === "giving" || e.stage === "graceful";
    if (!ends) continue;
    if (e.practiced) {
      t.practiceOutcome = e.stage === "celebrating" ? "good" : "missed";
    } else if (t.outcome === null) {
      t.tries = e.tries ?? 0;
      t.nudges = e.nudges ?? 0;
      t.outcome =
        e.stage === "graceful" ? "error"
        : e.stage === "celebrating" ? (t.tries === 0 && t.nudges === 0 && !e.modeled ? "first_try" : "after_help")
        : t.spoke ? "gave" : "no_answer";
    }
  }

  if (sorted.at(-1)?.type !== "session_end") session.endedAt = null; // hid the tab, then came back

  const out: PlayTurn[] = [...turns.values()].map(({ heard, spoke: _spoke, ...t }) => ({
    ...t,
    transcript: heard.join(" / ").slice(0, 2000),
    answerStatus:
      t.outcome === "first_try" || t.outcome === "after_help" ? "correct"
      : t.outcome === "gave" ? "incorrect"
      : t.outcome === "no_answer" ? "unclear"
      : "not_assessed",
  }));
  return { session, turns: out };
}
