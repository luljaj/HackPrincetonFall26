import { z } from "zod";
import { AuthoredIdSchema, PublicQuestionSchema, UuidSchema } from "./scene";
import { LearningAssessmentSchema, SelectedResponseSchema } from "./evidence";

export const CreateSessionRequestSchema = z.strictObject({
  sceneId: AuthoredIdSchema,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export const CreateSessionResponseSchema = z.strictObject({
  sessionId: UuidSchema,
  turnNumber: z.literal(0),
  question: PublicQuestionSchema,
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export const TurnRequestMetadataSchema = z.strictObject({
  interactionId: UuidSchema,
  questionId: AuthoredIdSchema,
  expectedTurnNumber: z.number().int().nonnegative(),
});
export type TurnRequestMetadata = z.infer<typeof TurnRequestMetadataSchema>;
export const TurnResponseSchema = z.strictObject({
  sessionId: UuidSchema,
  interactionId: UuidSchema,
  turnNumber: z.number().int().positive(),
  response: SelectedResponseSchema,
  assessment: LearningAssessmentSchema,
});
export type TurnResponse = z.infer<typeof TurnResponseSchema>;
export const PipelineErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "INVALID_REQUEST",
      "UNSUPPORTED_AUDIO",
      "AUDIO_TOO_LARGE",
      "SESSION_NOT_FOUND",
      "TURN_CONFLICT",
      "PROVIDER_ERROR",
      "INVALID_MODEL_OUTPUT",
      "PERSISTENCE_ERROR",
    ]),
    message: z.string().trim().min(1).max(500),
    requestId: AuthoredIdSchema,
  }),
});
export type PipelineErrorResponse = z.infer<typeof PipelineErrorResponseSchema>;
