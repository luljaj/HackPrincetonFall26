import {
  SAMPLE_SESSION_ID,
  sampleInteractions,
  sampleSessionRecord,
} from "../../server/storage/sample-data";
import type { ParentView } from "./types";

// Parent-safe view of the sample session, used when no database is configured.
// Derived from server/storage/sample-data.ts so the fixture and the seeded rows never drift.
export { SAMPLE_SESSION_ID };

const last = sampleInteractions.at(-1);
const active = sampleSessionRecord.activeQuestion;
const finalActive = last ? last.nextQuestion : active;

export const sampleView: ParentView = {
  sceneId: sampleSessionRecord.sceneSnapshot.sceneId,
  startedAt: sampleSessionRecord.createdAt,
  objectiveId: sampleSessionRecord.sceneSnapshot.objectiveId,
  isSample: true,
  progress: {
    sessionId: SAMPLE_SESSION_ID,
    objective: sampleSessionRecord.sceneSnapshot.objective,
    activeQuestion: finalActive && { questionId: finalActive.questionId, text: finalActive.text },
    interactions: sampleInteractions.map((i) => ({
      interactionId: i.interactionId,
      turnNumber: i.turnNumber,
      questionId: i.questionId,
      questionText: i.questionText,
      transcript: i.transcript,
      responseText: i.responseText,
      responseType: i.responseType,
      assessment: i.assessment,
      assistanceInResponse: i.assistanceInResponse,
    })),
    episode: {
      turns: sampleInteractions.length,
      responsesWithAssistance: sampleInteractions.filter((i) => i.assistanceInResponse).length,
      finalStatus: last ? last.assessment.answerStatus : null,
      parentSummary: last?.parentSummary ?? null,
    },
  },
};
