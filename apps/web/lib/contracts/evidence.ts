import { z } from "zod";
import { PublicQuestionSchema } from "./scene";

export const AnswerStatusSchema = z.enum([
  "correct",
  "incorrect",
  "unclear",
  "off_topic",
  "not_assessed",
]);
export const LearningAssessmentSchema = z.strictObject({
  answerStatus: AnswerStatusSchema,
  evidence: z.string().trim().min(1).max(1000).nullable(),
  possibleMisconception: z.string().trim().min(1).max(1000).nullable(),
  assistanceBeforeAnswer: z.boolean(),
});
export type LearningAssessment = z.infer<typeof LearningAssessmentSchema>;
export const ResponseTypeSchema = z.enum(["teaching", "clarification"]);
export const SelectedResponseSchema = z.strictObject({
  type: ResponseTypeSchema,
  text: z.string().trim().min(1).max(2000),
  nextQuestion: PublicQuestionSchema.nullable(),
});
export type SelectedResponse = z.infer<typeof SelectedResponseSchema>;
