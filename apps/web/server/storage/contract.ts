import { z } from "zod";
import {
  AuthoredIdSchema,
  QuestionContextSchema,
  SceneConfigSchema,
  UuidSchema,
  type QuestionContext,
} from "../../lib/contracts/scene";
import {
  LearningAssessmentSchema,
  ResponseTypeSchema,
} from "../../lib/contracts/evidence";
import { TurnResponseSchema } from "../../lib/contracts/turn";
import { LunaDraftSchema } from "../pipeline/luna-contract";

const summarySchema = z.string().trim().min(1).max(200).nullable();
const durationSchema = z.number().finite().nonnegative();
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const publicQuestion = (question: QuestionContext | null) =>
  question && { questionId: question.questionId, text: question.text };

export const InteractionRecordSchema = z
  .strictObject({
    sessionId: UuidSchema,
    interactionId: UuidSchema,
    turnNumber: z.number().int().positive(),
    sceneId: AuthoredIdSchema,
    objectiveId: AuthoredIdSchema,
    completedAt: z.iso.datetime(),
    questionId: AuthoredIdSchema,
    questionText: z.string().trim().min(1).max(300),
    answerGuide: z.string().trim().min(1).max(1000),
    transcript: z.string().max(10000),
    responseType: ResponseTypeSchema,
    responseText: z.string().trim().min(1).max(2000),
    nextQuestion: QuestionContextSchema.nullable(),
    assessment: LearningAssessmentSchema,
    assistanceInResponse: z.boolean(),
    parentSummary: summarySchema,
    turnResponse: TurnResponseSchema,
    diagnostics: z.strictObject({
      lunaDraft: LunaDraftSchema.nullable(),
      transcriptionModel: z.string().trim().min(1).max(128),
      lunaModel: z.string().trim().min(1).max(128).nullable(),
      promptRevision: z.string().trim().min(1).max(128),
      timings: z.strictObject({
        transcriptionMs: durationSchema.nullable(),
        lunaMs: durationSchema.nullable(),
        processingBeforeCommitMs: durationSchema,
      }),
    }),
  })
  .superRefine((record, ctx) => {
    const expected = {
      sessionId: record.sessionId,
      interactionId: record.interactionId,
      turnNumber: record.turnNumber,
      response: {
        type: record.responseType,
        text: record.responseText,
        nextQuestion: publicQuestion(record.nextQuestion),
      },
      assessment: record.assessment,
    };
    if (!same(record.turnResponse, expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["turnResponse"],
        message:
          "Replay response must match the canonical record and public next question",
      });
    }
  });
export type InteractionRecord = z.infer<typeof InteractionRecordSchema>;

const sessionFields = {
  sessionId: UuidSchema,
  createdAt: z.iso.datetime(),
  sceneSnapshot: SceneConfigSchema,
  assistanceProvided: z.boolean(),
};
export const SessionRecordSchema = z
  .strictObject({
    ...sessionFields,
    turnNumber: z.literal(0),
    activeQuestion: QuestionContextSchema,
    latestParentSummary: z.null(),
  })
  .superRefine((session, ctx) => {
    if (
      !same(session.activeQuestion, session.sceneSnapshot.initialQuestion) ||
      session.assistanceProvided !==
        session.sceneSnapshot.assistanceAlreadyProvided
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "New session must match its prepared question and assistance state",
      });
    }
  });
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export const SessionSnapshotSchema = z
  .strictObject({
    ...sessionFields,
    turnNumber: z.number().int().nonnegative(),
    activeQuestion: QuestionContextSchema.nullable(),
    latestParentSummary: summarySchema,
    interactions: z.array(InteractionRecordSchema),
  })
  .superRefine((session, ctx) => {
    let question: QuestionContext | null =
      session.sceneSnapshot.initialQuestion;
    let assistance = session.sceneSnapshot.assistanceAlreadyProvided;
    let summary: string | null = null;
    const interactionIds = new Set<string>();
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const [index, record] of session.interactions.entries()) {
      if (
        record.sessionId !== session.sessionId ||
        record.sceneId !== session.sceneSnapshot.sceneId ||
        record.objectiveId !== session.sceneSnapshot.objectiveId ||
        record.turnNumber !== index + 1 ||
        interactionIds.has(record.interactionId)
      ) {
        fail(
          "Interactions must be unique, ordered, and belong to this session scene/objective",
        );
      }
      interactionIds.add(record.interactionId);
      if (
        !question ||
        record.questionId !== question.questionId ||
        record.questionText !== question.text ||
        record.answerGuide !== question.answerGuide ||
        record.assessment.assistanceBeforeAnswer !== assistance
      ) {
        fail(
          "Interaction must answer the active question with the prior assistance state",
        );
      }
      if (
        record.nextQuestion &&
        record.nextQuestion.questionId !== record.questionId &&
        !UuidSchema.safeParse(record.nextQuestion.questionId).success
      ) {
        fail("Generated variant question IDs must be UUIDs");
      }
      const status = record.assessment.answerStatus;
      const assessed = status === "correct" || status === "incorrect";
      const original =
        record.questionId === session.sceneSnapshot.initialQuestion.questionId;
      if (
        assessed &&
        (!original || status === "correct") &&
        record.nextQuestion !== null
      ) {
        fail(
          "A correct original or any assessed variant must finish the teaching moment",
        );
      }
      if (
        original &&
        status === "incorrect" &&
        (!record.nextQuestion ||
          record.nextQuestion.questionId === record.questionId ||
          record.nextQuestion.text === record.questionText)
      ) {
        fail("An incorrect original must expose a different variant");
      }
      if (!assessed && !same(record.nextQuestion, question)) {
        fail("Clarification must retain the active question");
      }
      question = record.nextQuestion;
      assistance ||= record.assistanceInResponse;
      if (record.parentSummary !== null) summary = record.parentSummary;
    }
    if (
      session.turnNumber !== session.interactions.length ||
      !same(session.activeQuestion, question) ||
      session.assistanceProvided !== assistance ||
      session.latestParentSummary !== summary
    ) {
      fail("Session state must match its committed interaction history");
    }
  });
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

export const CommitTurnInputSchema = z
  .strictObject({
    sessionId: UuidSchema,
    expectedTurnNumber: z.number().int().nonnegative(),
    interaction: InteractionRecordSchema,
  })
  .superRefine((input, ctx) => {
    if (
      input.sessionId !== input.interaction.sessionId ||
      input.expectedTurnNumber + 1 !== input.interaction.turnNumber
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Commit identity/version must agree with the interaction",
      });
    }
  });
export type CommitTurnInput = z.infer<typeof CommitTurnInputSchema>;

/** Atomically save before success. Duplicate (sessionId, interactionId) lookup precedes
 * the expected-version check, returning the exact original record without another write.
 * A distinct stale request fails; summaries only update when non-null and help is sticky.
 */
export interface PipelineStore {
  createSession(session: SessionRecord): Promise<void>;
  loadSession(sessionId: string): Promise<SessionSnapshot | null>;
  commitTurn(
    input: CommitTurnInput,
  ): Promise<{ record: InteractionRecord; replayed: boolean }>;
}
