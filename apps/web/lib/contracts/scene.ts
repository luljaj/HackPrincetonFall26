import { z } from "zod";

// Stable authored identifiers; generated session/interaction/variant IDs use UUIDs.
export const AuthoredIdSchema = z.string().trim().min(1).max(128);
export const UuidSchema = z.uuid();
export const QuestionContextSchema = z.strictObject({
  questionId: AuthoredIdSchema,
  text: z.string().trim().min(1).max(300),
  answerGuide: z.string().trim().min(1).max(1000),
});
export type QuestionContext = z.infer<typeof QuestionContextSchema>;
export const PublicQuestionSchema = QuestionContextSchema.pick({
  questionId: true,
  text: true,
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;
export const SceneConfigSchema = z.strictObject({
  sceneId: AuthoredIdSchema,
  objectiveId: AuthoredIdSchema,
  objective: z.string().trim().min(1).max(500),
  sceneFacts: z.array(z.string().trim().min(1).max(300)).max(20),
  transcriptionHints: z.array(z.string().trim().min(1).max(100)).max(50),
  character: z.strictObject({
    name: z.string().trim().min(1).max(100),
    speakingStyle: z.string().trim().min(1).max(500),
  }),
  learnerDescription: z.string().trim().min(1).max(500).nullable(),
  initialQuestion: QuestionContextSchema,
  assistanceAlreadyProvided: z.boolean(),
});
export type SceneConfig = z.infer<typeof SceneConfigSchema>;
