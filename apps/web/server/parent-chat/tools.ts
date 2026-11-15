// Read-only tools for the parent chat (ai-chat-plan.md §4). Pure functions over the parent
// views, so they share the dashboard's privacy boundary: views already passed
// SessionProgressSchema, which carries no answer guides or Luna drafts.
import { nextStepFor } from "../../lib/parent/next-steps";
import { showFor } from "../../lib/parent/shows";
import type { ParentView } from "../../lib/parent/types";
import type { PracticeRow, TopicRow } from "../storage/play";

export type PlayStats = { topics: readonly TopicRow[]; practice: readonly PracticeRow[] };
const LANGUAGE: Record<string, string> = { es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };

type Args = Record<string, unknown>;
export type ToolResult = { data: unknown; sessionIds: string[] };

// Same rule as parentStats: sample sessions only count when no real session exists.
function counted(views: readonly ParentView[]): ParentView[] {
  const real = views.filter((v) => !v.isSample);
  return real.length > 0 ? real : [...views];
}

function summary(v: ParentView) {
  const { show, episode } = showFor(v.sceneId);
  return {
    sessionId: v.progress.sessionId,
    show,
    episode,
    objective: v.progress.objective,
    startedAt: v.startedAt,
    questionsAnswered: v.progress.episode.turns,
    latestStatus: v.progress.episode.finalStatus,
    parentSummary: v.progress.episode.parentSummary,
    stillWatching: v.progress.activeQuestion !== null,
    isSample: v.isSample,
  };
}

function tally(views: readonly ParentView[]) {
  const turns = views.flatMap((v) => v.progress.interactions);
  const n = (pred: (t: (typeof turns)[number]) => boolean) => turns.filter(pred).length;
  return {
    questions: turns.length,
    correctBeforeHelp: n((t) => t.assessment.answerStatus === "correct" && !t.assessment.assistanceBeforeAnswer),
    correctAfterHelp: n((t) => t.assessment.answerStatus === "correct" && t.assessment.assistanceBeforeAnswer),
    incorrect: n((t) => t.assessment.answerStatus === "incorrect"),
    unclearOrNotAssessed: n((t) => !["correct", "incorrect"].includes(t.assessment.answerStatus)),
  };
}

const ids = (views: readonly ParentView[]) => views.map((v) => v.progress.sessionId);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null);

export function runTool(name: string, args: Args, views: readonly ParentView[], now = new Date(), play: PlayStats = { topics: [], practice: [] }): ToolResult {
  const pool = counted(views);
  switch (name) {
    case "list_sessions": {
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 20) : 10;
      const picked = pool.slice(0, limit);
      return { data: picked.map(summary), sessionIds: ids(picked) };
    }
    case "get_session": {
      const v = views.find((x) => x.progress.sessionId === args.sessionId);
      if (!v) return { data: { error: "No session with that ID." }, sessionIds: [] };
      return {
        data: {
          ...summary(v),
          responsesWithAssistance: v.progress.episode.responsesWithAssistance,
          turns: v.progress.interactions.map((t) => ({
            question: t.questionText,
            childSaid: t.transcript,
            doraReplied: t.responseText,
            status: t.assessment.answerStatus,
            helpBeforeAnswer: t.assessment.assistanceBeforeAnswer,
            evidence: t.assessment.evidence,
            possibleMisconception: t.assessment.possibleMisconception,
          })),
        },
        sessionIds: [v.progress.sessionId],
      };
    }
    case "get_today": {
      const day = now.toDateString();
      const today = pool.filter((v) => new Date(v.startedAt).toDateString() === day);
      return { data: { date: day, sessions: today.map(summary), totals: tally(today) }, sessionIds: ids(today) };
    }
    case "get_skill_progress": {
      const q = str(args.skill);
      if (play.topics.length > 0 || play.practice.length > 0) {
        // Real play: per-topic and per-language counts straight from play_turns (SQL group-bys).
        const topics = play.topics
          .filter((t) => !q || `${t.topic} ${t.subject}`.toLowerCase().includes(q))
          .map(({ lastSeen, noAnswer, gave, ...r }) => ({ ...r, shownByDora: gave, noAnswerHeard: noAnswer, lastSeen: new Date(lastSeen).toISOString() }));
        const practice = play.practice
          .map((p) => ({ language: LANGUAGE[p.language] ?? p.language, words: p.words, tried: p.tried, saidIt: p.saidIt, lastSeen: new Date(p.lastSeen).toISOString() }))
          .filter((p) => !q || `${p.language} language practice`.toLowerCase().includes(q));
        return {
          data: topics.length || practice.length
            ? { topics, languagePractice: practice }
            : { note: "Nothing on that yet.", topicsWithData: play.topics.map((t) => t.topic), languagesPractised: play.practice.map((p) => LANGUAGE[p.language] ?? p.language) },
          sessionIds: [],
        };
      }
      const groups = new Map<string, ParentView[]>();
      for (const v of pool) {
        if (q && !`${v.objectiveId} ${v.progress.objective}`.toLowerCase().includes(q)) continue;
        groups.set(v.objectiveId, [...(groups.get(v.objectiveId) ?? []), v]);
      }
      const skills = [...groups.values()].map((vs) => ({
        objective: vs[0]!.progress.objective,
        sessions: vs.length,
        lastSeen: vs[0]!.startedAt,
        ...tally(vs),
        tryAtHome: nextStepFor(vs[0]!.objectiveId),
      }));
      return { data: skills.length ? skills : { note: "No sessions on that skill yet." }, sessionIds: ids([...groups.values()].flat()) };
    }
    case "get_misconceptions": {
      const hits = pool.flatMap((v) =>
        v.progress.interactions
          .filter((t) => t.assessment.possibleMisconception)
          .map((t) => ({ sessionId: v.progress.sessionId, objective: v.progress.objective, question: t.questionText, childSaid: t.transcript, note: t.assessment.possibleMisconception })),
      );
      return { data: hits.length ? hits : { note: "No possible misconceptions recorded." }, sessionIds: [...new Set(hits.map((h) => h.sessionId))] };
    }
    default:
      return { data: { error: `Unknown tool ${name}.` }, sessionIds: [] };
  }
}

const fn = (name: string, description: string, properties: Record<string, unknown> = {}) => ({
  type: "function" as const,
  name,
  description,
  strict: true,
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

export const chatTools = [
  fn("list_sessions", "Recent watching sessions, newest first: show, objective, date, questions answered, latest status.", {
    limit: { type: ["number", "null"], description: "Max sessions, default 10." },
  }),
  fn("get_session", "One session in full: each question, what the child said, Dora's reply, and the assessment.", {
    sessionId: { type: "string" },
  }),
  fn("get_today", "Today's sessions, totals, and whether the child is watching right now (stillWatching)."),
  fn("get_skill_progress", "Counts per topic (Numbers, Shapes, Words, Objects, Places...) across all sessions: first try, after help, shown by Dora. Also words practised in other languages (French, Spanish...) and whether the child said them. Use for progress, 'how is X going', language practice, and what to practice next.", {
    skill: { type: ["string", "null"], description: "Topic, subject or language filter, e.g. 'numbers', 'math', 'french'. Null for all." },
  }),
  fn("get_misconceptions", "Possible misconceptions the judge noted, with the question and what the child said."),
];
