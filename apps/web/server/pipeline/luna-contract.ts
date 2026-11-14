import { z } from "zod";

// Pure schema module: provider clients/Next entry points carry the server-only guard.
export const LunaDraftSchema = z.strictObject({
  feedbackText: z.string().trim().min(1).max(1500),
  nextQuestion: z
    .strictObject({
      text: z.string().trim().min(1).max(300),
      answerGuide: z.string().trim().min(1).max(1000),
    })
    .nullable(),
  assistanceProvided: z.boolean(),
  assessment: z.strictObject({
    answerStatus: z.enum(["correct", "incorrect", "unclear", "off_topic"]),
    evidence: z.string().trim().min(1).max(1000).nullable(),
    possibleMisconception: z.string().trim().min(1).max(1000).nullable(),
  }),
  parentSummary: z.string().trim().min(1).max(200),
});
export type LunaDraft = z.infer<typeof LunaDraftSchema>;
