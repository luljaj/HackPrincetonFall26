import { z } from "zod";
import { AuthoredIdSchema, PublicQuestionSchema, UuidSchema } from "./scene";
import {
  AnswerStatusSchema,
  LearningAssessmentSchema,
  ResponseTypeSchema,
} from "./evidence";

export const ProgressInteractionSchema = z.strictObject({
  interactionId: UuidSchema,
  turnNumber: z.number().int().positive(),
  questionId: AuthoredIdSchema,
  questionText: z.string().trim().min(1).max(300),
  transcript: z.string().max(10000),
  responseText: z.string().trim().min(1).max(2000),
  responseType: ResponseTypeSchema,
  assessment: LearningAssessmentSchema,
  assistanceInResponse: z.boolean(),
});
export const SessionProgressSchema = z
  .strictObject({
    sessionId: UuidSchema,
    objective: z.string().trim().min(1).max(500),
    activeQuestion: PublicQuestionSchema.nullable(),
    interactions: z.array(ProgressInteractionSchema),
    episode: z.strictObject({
      turns: z.number().int().nonnegative(),
      responsesWithAssistance: z.number().int().nonnegative(),
      finalStatus: AnswerStatusSchema.nullable(),
      parentSummary: z.string().trim().min(1).max(200).nullable(),
    }),
  })
  .superRefine((value, ctx) => {
    const { interactions, episode } = value;
    if (
      episode.turns !== interactions.length ||
      episode.responsesWithAssistance !==
        interactions.filter((turn) => turn.assistanceInResponse).length ||
      episode.finalStatus !==
        (interactions.at(-1)?.assessment.answerStatus ?? null) ||
      interactions.some((turn, index) => turn.turnNumber !== index + 1) ||
      new Set(interactions.map((turn) => turn.interactionId)).size !==
        interactions.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Progress must agree with ordered committed interactions",
      });
    }
  });
export type SessionProgress = z.infer<typeof SessionProgressSchema>;
export interface ProgressReader {
  getSessionProgress(sessionId: string): Promise<SessionProgress | null>;
}
