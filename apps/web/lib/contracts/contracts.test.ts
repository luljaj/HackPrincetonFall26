import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import * as contracts from "./index";
import * as fixtures from "./fixtures";
import { exampleScene } from "../../server/scenes/example.scene";
import { LunaDraftSchema } from "../../server/pipeline/luna-contract";
import {
  CommitTurnInputSchema,
  InteractionRecordSchema,
  SessionRecordSchema,
  SessionSnapshotSchema,
  type InteractionRecord,
} from "../../server/storage/contract";

const session = {
  sessionId: fixtures.sessionId,
  createdAt: "2026-11-14T12:00:00.000Z",
  sceneSnapshot: exampleScene,
  turnNumber: 0 as const,
  activeQuestion: exampleScene.initialQuestion,
  assistanceProvided: false,
  latestParentSummary: null,
};
const draft = {
  feedbackText: "There are three red apples. Let's count another set.",
  nextQuestion: {
    text: fixtures.variantQuestion.text,
    answerGuide: "Two; accept 2 or two apples.",
  },
  assistanceProvided: true,
  assessment: {
    answerStatus: "incorrect" as const,
    evidence: fixtures.incorrectOriginalResponse.assessment.evidence,
    possibleMisconception:
      fixtures.incorrectOriginalResponse.assessment.possibleMisconception,
  },
  parentSummary: fixtures.pendingProgress.episode.parentSummary,
};
const original: InteractionRecord = {
  sessionId: fixtures.sessionId,
  interactionId: fixtures.originalInteractionId,
  turnNumber: 1,
  sceneId: exampleScene.sceneId,
  objectiveId: exampleScene.objectiveId,
  completedAt: "2026-11-14T12:00:01.000Z",
  questionId: exampleScene.initialQuestion.questionId,
  questionText: exampleScene.initialQuestion.text,
  answerGuide: exampleScene.initialQuestion.answerGuide,
  transcript: "Two.",
  responseType: "teaching",
  responseText: fixtures.incorrectOriginalResponse.response.text,
  nextQuestion: {
    ...fixtures.variantQuestion,
    answerGuide: draft.nextQuestion.answerGuide,
  },
  assessment: fixtures.incorrectOriginalResponse.assessment,
  assistanceInResponse: true,
  parentSummary: draft.parentSummary,
  turnResponse: fixtures.incorrectOriginalResponse,
  diagnostics: {
    lunaDraft: draft,
    transcriptionModel: "gpt-transcribe",
    lunaModel: "gpt-6-luna",
    promptRevision: "synthetic-v1",
    timings: { transcriptionMs: 10, lunaMs: 20, processingBeforeCommitMs: 35 },
  },
};
const variant: InteractionRecord = {
  ...original,
  interactionId: fixtures.variantInteractionId,
  turnNumber: 2,
  questionId: fixtures.variantQuestionId,
  questionText: fixtures.variantQuestion.text,
  answerGuide: draft.nextQuestion.answerGuide,
  nextQuestion: null,
  responseText: fixtures.correctVariantResponse.response.text,
  assessment: fixtures.correctVariantResponse.assessment,
  assistanceInResponse: false,
  parentSummary: fixtures.terminalProgress.episode.parentSummary,
  turnResponse: fixtures.correctVariantResponse,
  diagnostics: {
    ...original.diagnostics,
    lunaDraft: {
      ...draft,
      nextQuestion: null,
      assistanceProvided: false,
      feedbackText: fixtures.correctVariantResponse.response.text,
      assessment: {
        answerStatus: "correct",
        evidence: fixtures.correctVariantResponse.assessment.evidence,
        possibleMisconception: null,
      },
      parentSummary: fixtures.terminalProgress.episode.parentSummary,
    },
  },
};
function snapshot(interactions: InteractionRecord[]) {
  return {
    ...session,
    turnNumber: interactions.length,
    activeQuestion:
      interactions.at(-1)?.nextQuestion ??
      (interactions.length ? null : session.activeQuestion),
    assistanceProvided: interactions.some((turn) => turn.assistanceInResponse),
    latestParentSummary:
      [...interactions].reverse().find((turn) => turn.parentSummary !== null)
        ?.parentSummary ?? null,
    interactions,
  };
}
function rejects(schema: z.ZodType, value: unknown) {
  assert.equal(schema.safeParse(value).success, false);
}

test("synthetic public fixtures parse at every boundary", () => {
  contracts.CreateSessionRequestSchema.parse(fixtures.createSessionRequest);
  contracts.CreateSessionResponseSchema.parse(fixtures.createSessionResponse);
  contracts.TurnRequestMetadataSchema.parse(fixtures.turnRequestMetadata);
  contracts.TurnResponseSchema.parse(fixtures.incorrectOriginalResponse);
  contracts.TurnResponseSchema.parse(fixtures.correctVariantResponse);
  contracts.SessionProgressSchema.parse(fixtures.pendingProgress);
  contracts.SessionProgressSchema.parse(fixtures.terminalProgress);
  contracts.SessionUpdatedEventSchema.parse(fixtures.sessionUpdatedEvent);
  contracts.SceneConfigSchema.parse(exampleScene);
  contracts.PipelineErrorResponseSchema.parse({
    error: {
      code: "TURN_CONFLICT",
      message: "Question no longer active.",
      requestId: fixtures.originalInteractionId,
    },
  });
});

test("public objects reject unknown and private fields recursively", () => {
  const response = fixtures.incorrectOriginalResponse;
  rejects(contracts.TurnResponseSchema, {
    ...response,
    parentSummary: "Private",
  });
  rejects(contracts.TurnResponseSchema, {
    ...response,
    diagnostics: original.diagnostics,
  });
  rejects(contracts.TurnResponseSchema, {
    ...response,
    response: { ...response.response, nextQuestion: original.nextQuestion },
  });
  rejects(contracts.TurnResponseSchema, {
    ...response,
    assessment: { ...response.assessment, lunaDraft: draft },
  });
  rejects(contracts.SessionProgressSchema, {
    ...fixtures.pendingProgress,
    interactions: [original],
  });
  rejects(contracts.SessionUpdatedEventSchema, {
    ...fixtures.sessionUpdatedEvent,
    transcript: "Private",
  });
  rejects(contracts.CreateSessionRequestSchema, {
    sceneId: "demo-scene",
    prompt: "Override",
  });
  rejects(contracts.TurnRequestMetadataSchema, {
    ...fixtures.turnRequestMetadata,
    transcript: "Injected",
  });
});

test("identities, counters, timestamps, and configured length bounds are strict", () => {
  rejects(contracts.TurnResponseSchema, {
    ...fixtures.correctVariantResponse,
    sessionId: "bad-id",
  });
  rejects(contracts.TurnRequestMetadataSchema, {
    ...fixtures.turnRequestMetadata,
    interactionId: "bad-id",
  });
  rejects(contracts.TurnRequestMetadataSchema, {
    ...fixtures.turnRequestMetadata,
    expectedTurnNumber: "0",
  });
  for (const expectedTurnNumber of [-1, 0.5, Infinity])
    rejects(contracts.TurnRequestMetadataSchema, {
      ...fixtures.turnRequestMetadata,
      expectedTurnNumber,
    });
  rejects(contracts.CreateSessionRequestSchema, { sceneId: " " });
  rejects(contracts.PublicQuestionSchema, {
    questionId: "q",
    text: "x".repeat(301),
  });
  rejects(contracts.SceneConfigSchema, {
    ...exampleScene,
    sceneFacts: Array(21).fill("Fact"),
  });
  rejects(InteractionRecordSchema, { ...original, completedAt: "yesterday" });
  rejects(InteractionRecordSchema, {
    ...original,
    diagnostics: {
      ...original.diagnostics,
      timings: { ...original.diagnostics.timings, lunaMs: -1 },
    },
  });
});

test("private Luna draft has required nullable fields and works with SDK structured output helper", () => {
  LunaDraftSchema.parse(draft);
  const format = zodTextFormat(LunaDraftSchema, "teaching_draft");
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  const { nextQuestion: omitted, ...missing } = draft;
  assert.ok(omitted);
  rejects(LunaDraftSchema, missing);
  rejects(LunaDraftSchema, {
    ...draft,
    nextQuestion: {
      ...draft.nextQuestion,
      questionId: fixtures.variantQuestionId,
    },
  });
  rejects(LunaDraftSchema, { ...draft, parentSummary: "x".repeat(201) });
  rejects(LunaDraftSchema, {
    ...draft,
    assessment: { ...draft.assessment, answerStatus: "not_assessed" },
  });
});

test("private record and exact public replay must agree for every canonical field", () => {
  InteractionRecordSchema.parse(original);
  InteractionRecordSchema.parse(variant);
  const mismatches = [
    { sessionId: fixtures.variantInteractionId },
    { interactionId: fixtures.variantInteractionId },
    { turnNumber: 2 },
    { responseText: "Different speech" },
    { responseType: "clarification" },
    { assessment: { ...original.assessment, assistanceBeforeAnswer: true } },
    { nextQuestion: null },
    { nextQuestion: { ...original.nextQuestion, text: "Different question" } },
  ];
  for (const mismatch of mismatches)
    rejects(InteractionRecordSchema, { ...original, ...mismatch });
  CommitTurnInputSchema.parse({
    sessionId: fixtures.sessionId,
    expectedTurnNumber: 0,
    interaction: original,
  });
  rejects(CommitTurnInputSchema, {
    sessionId: fixtures.variantInteractionId,
    expectedTurnNumber: 0,
    interaction: original,
  });
  rejects(CommitTurnInputSchema, {
    sessionId: fixtures.sessionId,
    expectedTurnNumber: 1,
    interaction: original,
  });
});

test("initial, pending-variant, terminal, and wrong-variant states retain honest history", () => {
  SessionRecordSchema.parse(session);
  SessionSnapshotSchema.parse(snapshot([]));
  SessionSnapshotSchema.parse(snapshot([original]));
  SessionSnapshotSchema.parse(snapshot([original, variant]));
  const wrongVariant = {
    ...variant,
    assessment: { ...variant.assessment, answerStatus: "incorrect" as const },
  };
  wrongVariant.turnResponse = {
    ...variant.turnResponse,
    assessment: wrongVariant.assessment,
  };
  SessionSnapshotSchema.parse(snapshot([original, wrongVariant]));
  const thirdQuestion = {
    ...variant,
    nextQuestion: original.nextQuestion,
    turnResponse: {
      ...variant.turnResponse,
      response: {
        ...variant.turnResponse.response,
        nextQuestion: fixtures.variantQuestion,
      },
    },
  };
  rejects(SessionSnapshotSchema, snapshot([original, thirdQuestion]));
  rejects(SessionSnapshotSchema, {
    ...snapshot([original]),
    activeQuestion: null,
  });
  rejects(SessionSnapshotSchema, {
    ...snapshot([original, variant]),
    activeQuestion: original.nextQuestion,
  });
  rejects(SessionSnapshotSchema, {
    ...snapshot([original]),
    assistanceProvided: false,
  });
  rejects(SessionRecordSchema, {
    ...session,
    activeQuestion: original.nextQuestion,
  });
});

test("session agreement rejects stale question, wrong scope, invalid variants and reordered history", () => {
  rejects(SessionSnapshotSchema, snapshot([variant, original]));
  rejects(SessionSnapshotSchema, {
    ...snapshot([original]),
    sessionId: fixtures.variantInteractionId,
  });
  const invalidVariant = {
    ...original,
    nextQuestion: { ...original.nextQuestion!, questionId: "not-a-uuid" },
    turnResponse: {
      ...original.turnResponse,
      response: {
        ...original.turnResponse.response,
        nextQuestion: { ...fixtures.variantQuestion, questionId: "not-a-uuid" },
      },
    },
  };
  rejects(SessionSnapshotSchema, snapshot([invalidVariant]));
  const staleQuestion = { ...variant, questionId: original.questionId };
  rejects(SessionSnapshotSchema, snapshot([original, staleQuestion]));
  rejects(SessionSnapshotSchema, {
    ...snapshot([original]),
    latestParentSummary: null,
  });
});

test("empty transcript clarifies same question and preserves prior parent summary", () => {
  const clarification: InteractionRecord = {
    ...variant,
    transcript: "",
    responseType: "clarification",
    responseText:
      "Please say that again. How many green apples are on the plate?",
    nextQuestion: original.nextQuestion,
    assessment: {
      answerStatus: "not_assessed",
      evidence: null,
      possibleMisconception: null,
      assistanceBeforeAnswer: true,
    },
    parentSummary: null,
    diagnostics: {
      ...original.diagnostics,
      lunaDraft: null,
      lunaModel: null,
      timings: {
        transcriptionMs: 5,
        lunaMs: null,
        processingBeforeCommitMs: 6,
      },
    },
  };
  clarification.turnResponse = {
    sessionId: clarification.sessionId,
    interactionId: clarification.interactionId,
    turnNumber: 2,
    response: {
      type: clarification.responseType,
      text: clarification.responseText,
      nextQuestion: fixtures.variantQuestion,
    },
    assessment: clarification.assessment,
  };
  const state = SessionSnapshotSchema.parse(
    snapshot([original, clarification]),
  );
  assert.equal(state.latestParentSummary, original.parentSummary);
  assert.equal(state.activeQuestion?.questionId, fixtures.variantQuestionId);
  const progress = {
    ...fixtures.terminalProgress,
    activeQuestion: fixtures.variantQuestion,
    interactions: [
      fixtures.pendingProgress.interactions[0],
      {
        ...fixtures.terminalProgress.interactions[1],
        transcript: "",
        responseText: clarification.responseText,
        responseType: "clarification",
        assessment: clarification.assessment,
      },
    ],
    episode: {
      ...fixtures.terminalProgress.episode,
      finalStatus: "not_assessed",
      parentSummary: original.parentSummary,
    },
  };
  contracts.SessionProgressSchema.parse(progress);
});

test("parent progress totals and latest status are canonical, including empty sessions", () => {
  contracts.SessionProgressSchema.parse({
    ...fixtures.pendingProgress,
    activeQuestion: fixtures.initialQuestion,
    interactions: [],
    episode: {
      turns: 0,
      responsesWithAssistance: 0,
      finalStatus: null,
      parentSummary: null,
    },
  });
  rejects(contracts.SessionProgressSchema, {
    ...fixtures.pendingProgress,
    episode: { ...fixtures.pendingProgress.episode, turns: 2 },
  });
  rejects(contracts.SessionProgressSchema, {
    ...fixtures.pendingProgress,
    episode: { ...fixtures.pendingProgress.episode, finalStatus: "correct" },
  });
  rejects(contracts.SessionProgressSchema, {
    ...fixtures.pendingProgress,
    episode: {
      ...fixtures.pendingProgress.episode,
      responsesWithAssistance: 0,
    },
  });
});

test("private persistence rejects audio payloads and relabeled original questions", () => {
  rejects(InteractionRecordSchema, { ...original, audio: "raw recording" });
  const repeated = {
    ...original,
    nextQuestion: { ...original.nextQuestion!, text: original.questionText },
    turnResponse: {
      ...original.turnResponse,
      response: {
        ...original.turnResponse.response,
        nextQuestion: {
          ...fixtures.variantQuestion,
          text: original.questionText,
        },
      },
    },
  };
  rejects(SessionSnapshotSchema, snapshot([repeated]));
});
