// Play session → the dashboard's ParentView, so every existing parent page and the chat read real
// play without changes. Wording follows learning-progress-plan.md §3 (counts, never "mastered").
import type { ParentView, ProgressInteraction } from "../parent/types";
import type { PlaySessionSummary, PlayTurn } from "./trace";

const REPLY: Record<NonNullable<PlayTurn["outcome"]>, string> = {
  first_try: "Dora cheered and the show went on.",
  after_help: "Dora helped, then cheered.",
  gave: "Dora showed the answer.",
  no_answer: "No answer was heard, so Dora moved on.",
  error: "Dora moved on.",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const LANGUAGE: Record<string, string> = { es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };
export const languageName = (code: string | null) => (code ? LANGUAGE[code] ?? code : "another language");

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function evidence(t: PlayTurn): string | null {
  const help = [t.tries && plural(t.tries, "hint"), t.nudges && plural(t.nudges, "nudge")].filter(Boolean).join(" and ");
  const parts = [
    t.expectedAnswer ? `Expected: ${t.expectedAnswer}.` : null,
    t.momentSeconds != null ? `At ${clock(t.momentSeconds)} in the episode.` : null,
    help ? `After ${help}.` : null,
    t.practiceWord ? `Practised the ${languageName(t.practiceLanguage)} word "${t.practiceWord}"${t.practiceOutcome === "good" ? " and said it" : ""}.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ").slice(0, 1000) : null;
}

export function summarize(turns: readonly PlayTurn[]): string | null {
  const done = turns.filter((t) => t.outcome && t.outcome !== "error");
  if (done.length === 0) return null;
  const n = (o: PlayTurn["outcome"]) => done.filter((t) => t.outcome === o).length;
  const parts = [`${plural(done.length, "question")} at the pauses: ${n("first_try")} answered correctly before help, ${n("after_help")} after help`];
  if (n("gave")) parts.push(`${n("gave")} shown by Dora`);
  const practised = done.filter((t) => t.practiceOutcome === "good");
  const langs = [...new Set(practised.map((t) => languageName(t.practiceLanguage)))].join(" and ");
  const text = `${parts.join(", ")}.${practised.length ? ` Said ${plural(practised.length, "word")} in ${langs}.` : ""}`;
  return text.slice(0, 200);
}

export function playToParentView(session: PlaySessionSummary, turns: readonly PlayTurn[]): ParentView {
  const finished = turns.filter((t) => t.outcome !== null);
  const open = turns.at(-1)?.outcome === null && session.endedAt === null ? turns.at(-1)! : null;
  const interactions: ProgressInteraction[] = finished.map((t, i) => ({
    interactionId: t.turnId,
    turnNumber: i + 1,
    questionId: t.spotId,
    questionText: (t.question || "A pause in the show").slice(0, 300),
    transcript: t.transcript,
    responseText: (t.doraReply || REPLY[t.outcome!]).slice(0, 2000),
    responseType: t.outcome === "no_answer" ? "clarification" : "teaching",
    assessment: {
      answerStatus: t.answerStatus,
      evidence: evidence(t),
      possibleMisconception: null,
      assistanceBeforeAnswer: t.tries > 0 || t.nudges > 0,
    },
    assistanceInResponse: t.tries > 0 || t.nudges > 0 || t.outcome === "gave",
  }));
  return {
    sceneId: session.episodeId,
    startedAt: new Date(session.startedAt).toISOString(),
    objectiveId: `play-${session.episodeId}`,
    isSample: false,
    progress: {
      sessionId: session.sessionId,
      objective: "Answer Dora's questions at the pauses",
      activeQuestion: open ? { questionId: open.spotId, text: (open.question || "A pause in the show").slice(0, 300) } : null,
      interactions,
      episode: {
        turns: interactions.length,
        responsesWithAssistance: interactions.filter((x) => x.assistanceInResponse).length,
        finalStatus: interactions.at(-1)?.assessment.answerStatus ?? null,
        parentSummary: summarize(finished),
      },
    },
  };
}
