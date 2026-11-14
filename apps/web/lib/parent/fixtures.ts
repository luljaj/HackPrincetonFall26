import {
  SAMPLE_SESSION_ID,
  sampleInteractions,
  sampleSessionRecord,
} from "../../server/storage/sample-data";
import type { SessionProgress } from "./types";

// Parent-safe view of the sample session, used when no database is configured.
// Derived from server/storage/sample-data.ts so the fixture and the seeded rows never drift.
export { SAMPLE_SESSION_ID };

const last = sampleInteractions.at(-1);

export const sampleSession: SessionProgress = {
  sessionId: SAMPLE_SESSION_ID,
  objectiveId: sampleSessionRecord.sceneSnapshot.objectiveId,
  objective: (sampleSessionRecord.sceneSnapshot as { objective: string }).objective,
  isSample: true,
  interactions: sampleInteractions.map((i) => ({
    interactionId: i.interactionId,
    turnNumber: i.turnNumber,
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
};
